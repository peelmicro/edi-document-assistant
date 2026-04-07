import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodeGeneratorService } from '../common/code-generator.service';
import { StorageService } from '../storage/storage.service';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  edi: 'application/edifact',
  xml: 'application/xml',
  json: 'application/json',
  csv: 'text/csv',
};

/**
 * Seeds the database with reference data and demo content.
 *
 * Each seeder is idempotent — uses upsert by unique `code` so the same
 * call can be made repeatedly without producing duplicates.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly storage: StorageService,
  ) {}

  async seedAll() {
    const aiProviders = await this.seedAiProviders();
    const formats = await this.seedFormats();
    const documents = await this.seedDocuments();
    const analyses = await this.seedAnalyses();
    const comparisons = await this.seedComparisons();
    return { aiProviders, formats, documents, analyses, comparisons };
  }

  async seedFormats() {
    const formats = [
      { code: 'edifact', name: 'EDIFACT' },
      { code: 'xml', name: 'XML' },
      { code: 'json', name: 'JSON' },
      { code: 'csv', name: 'CSV' },
    ];

    const results = await Promise.all(
      formats.map((f) =>
        this.prisma.format.upsert({
          where: { code: f.code },
          create: f,
          update: { name: f.name },
        }),
      ),
    );

    this.logger.log(`Seeded ${results.length} formats`);
    return results;
  }

  async seedAiProviders() {
    const providers = [
      {
        code: 'openai',
        name: 'OpenAI',
        models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
      },
      {
        code: 'anthropic',
        name: 'Anthropic',
        models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
      },
      {
        code: 'google',
        name: 'Google',
        models: ['gemini-3.1-pro', 'gemini-3-flash', 'gemini-3.1-flash-lite'],
      },
    ];

    const results = await Promise.all(
      providers.map((p) =>
        this.prisma.aiProvider.upsert({
          where: { code: p.code },
          create: { code: p.code, name: p.name, models: p.models },
          update: { name: p.name, models: p.models },
        }),
      ),
    );

    this.logger.log(`Seeded ${results.length} AI providers`);
    return results;
  }

  /**
   * Seeds 4 sample documents — one per format.
   *
   * Idempotent: skips a document if any document already exists with the same
   * filename. Storage path is a placeholder for now and will be replaced with
   * the real MinIO key once Phase 3 lands.
   */
  async seedDocuments() {
    const formats = await this.prisma.format.findMany();
    const formatByCode = new Map(formats.map((f) => [f.code, f]));

    const samples = [
      {
        filename: 'purchase-order-carrefour.edi',
        formatCode: 'edifact',
        tags: ['purchase order', 'carrefour', 'food', 'dairy'],
        description:
          'EDIFACT D96A purchase order from Carrefour ordering plant-based milk products from a supplier.',
      },
      {
        filename: 'invoice-tesco.xml',
        formatCode: 'xml',
        tags: ['invoice', 'tesco', 'produce', 'ubl'],
        description:
          'UBL 2.x invoice from Fresh Produce Ltd to Tesco Stores Ltd for organic bananas and apples.',
      },
      {
        filename: 'delivery-note-mercadona.json',
        formatCode: 'json',
        tags: ['despatch advice', 'mercadona', 'wine', 'rioja'],
        description:
          'JSON despatch advice from Bodegas Rioja Alta to Mercadona shipping Crianza, Reserva and Gran Reserva Rioja wines.',
      },
      {
        filename: 'product-catalog-aldi.csv',
        formatCode: 'csv',
        tags: ['product catalog', 'aldi', 'grocery'],
        description:
          'CSV product catalog from Aldi listing 13 grocery items across dairy, bakery, eggs, meat, produce and beverages.',
      },
    ];

    const created: Awaited<ReturnType<typeof this.prisma.document.create>>[] = [];
    for (const sample of samples) {
      const existing = await this.prisma.document.findFirst({
        where: { filename: sample.filename },
      });
      if (existing) {
        created.push(existing);
        continue;
      }

      const format = formatByCode.get(sample.formatCode);
      if (!format) {
        throw new Error(`Format not found for code: ${sample.formatCode}`);
      }

      const code = await this.codeGenerator.generate('DOC');

      // Read the sample file from disk and upload it to MinIO
      const filePath = join(__dirname, 'sample-documents', sample.filename);
      const fileBuffer = await readFile(filePath);
      const ext = sample.filename.split('.').pop() ?? '';
      const contentType = CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
      const objectKey = `seed/${code}-${sample.filename}`;
      await this.storage.uploadBuffer(objectKey, fileBuffer, contentType);

      const doc = await this.prisma.document.create({
        data: {
          code,
          filename: sample.filename,
          formatId: format.id,
          tags: sample.tags,
          description: sample.description,
          storagePath: objectKey,
        },
      });
      created.push(doc);
    }

    this.logger.log(`Seeded ${created.length} documents`);
    return created;
  }

  /**
   * Seeds 5 analyses — one per document plus one extra so the EDIFACT
   * purchase order has been analyzed by two different providers (used by
   * the comparison seeder to demo cross-provider comparison).
   *
   * Each analysis owns a `Process` row with mock AI result/response so the
   * frontend has something realistic to render before real AI calls land.
   *
   * Idempotent: short-circuits if any analysis already exists for the
   * (document, provider) pair.
   */
  async seedAnalyses() {
    const documents = await this.prisma.document.findMany({
      orderBy: { code: 'asc' },
    });
    const providers = await this.prisma.aiProvider.findMany();

    const docByFilename = new Map(documents.map((d) => [d.filename, d]));
    const providerByCode = new Map(providers.map((p) => [p.code, p]));

    const plan: Array<{ filename: string; providerCode: string; result: object; response: string }> = [
      {
        filename: 'purchase-order-carrefour.edi',
        providerCode: 'anthropic',
        result: {
          documentType: 'purchase_order',
          buyer: 'Carrefour (GLN 5412345678908)',
          supplier: 'GLN 4012345000009',
          orderNumber: 'PO-2026-04-001',
          orderDate: '2026-04-06',
          deliveryDate: '2026-04-20',
          currency: 'EUR',
          lineItemCount: 3,
          totalQuantity: 1000,
          estimatedTotal: 1340,
        },
        response:
          'This is a Carrefour purchase order (PO-2026-04-001) issued on 6 April 2026 with delivery requested for 20 April 2026. It contains 3 line items: 500 units of oat milk @ €1.25, 300 units of almond milk @ €1.85, and 200 units of soy milk @ €1.55, totalling roughly €1,340 before tax.',
      },
      {
        filename: 'purchase-order-carrefour.edi',
        providerCode: 'openai',
        result: {
          documentType: 'purchase_order',
          buyer: 'Carrefour',
          supplier: 'Plant Milk Supplier',
          orderNumber: 'PO-2026-04-001',
          deliveryDate: '2026-04-20',
          lineItems: [
            { ean: '4000862141404', name: 'Oat Milk 1L', qty: 500 },
            { ean: '4000862141411', name: 'Almond Milk 1L', qty: 300 },
            { ean: '4000862141428', name: 'Soy Milk 1L', qty: 200 },
          ],
        },
        response:
          'Purchase order PO-2026-04-001 from Carrefour. Delivery on 2026-04-20. Three plant-based milk SKUs (oat, almond, soy) for a total of 1,000 cartons.',
      },
      {
        filename: 'invoice-tesco.xml',
        providerCode: 'anthropic',
        result: {
          documentType: 'invoice',
          invoiceNumber: 'INV-2026-04-0042',
          issueDate: '2026-04-05',
          dueDate: '2026-05-05',
          currency: 'GBP',
          supplier: 'Fresh Produce Ltd',
          customer: 'Tesco Stores Ltd',
          subtotal: 1200,
          vat: 240,
          total: 1440,
          paymentTerms: 'Net 30 days',
        },
        response:
          'UBL invoice INV-2026-04-0042 from Fresh Produce Ltd to Tesco Stores Ltd issued 5 April 2026, due 5 May 2026. Net £1,200 + £240 VAT (20%) = £1,440 total. Two lines: 400 organic bananas and 200 organic apples, both at £2/kg.',
      },
      {
        filename: 'delivery-note-mercadona.json',
        providerCode: 'google',
        result: {
          documentType: 'despatch_advice',
          documentNumber: 'DN-2026-04-00187',
          buyer: 'Mercadona S.A.',
          supplier: 'Bodegas Rioja Alta',
          purchaseOrderRef: 'PO-MERCADONA-2026-03-7421',
          carrier: 'Transportes Iberia SL',
          trackingNumber: 'TI-2026-04-998877',
          expectedDeliveryDate: '2026-04-08',
          totalBottles: 2040,
          totalPackages: 168,
        },
        response:
          'Despatch advice DN-2026-04-00187 covering shipment from Bodegas Rioja Alta (Haro) to Mercadona CD Sant Sadurní. Linked to PO-MERCADONA-2026-03-7421. 2,040 bottles total: 1,200 Crianza + 600 Reserva + 240 Gran Reserva. Carrier: Transportes Iberia SL, tracking TI-2026-04-998877. Expected delivery 8 April 2026.',
      },
      {
        filename: 'product-catalog-aldi.csv',
        providerCode: 'openai',
        result: {
          documentType: 'product_catalog',
          supplier: 'Aldi',
          itemCount: 13,
          categories: ['Dairy', 'Bakery', 'Eggs', 'Meat', 'Produce', 'Beverages'],
          currency: 'EUR',
          priceRange: { min: 0.29, max: 5.49 },
        },
        response:
          'Aldi product catalog with 13 SKUs across 6 categories (Dairy, Bakery, Eggs, Meat, Produce, Beverages). Prices range from €0.29 (sparkling water 1.5L) to €5.49 (beef mince 500g). Two VAT rates apply: 7% for food, 19% for beverages.',
      },
    ];

    const created: unknown[] = [];
    for (const item of plan) {
      const document = docByFilename.get(item.filename);
      const provider = providerByCode.get(item.providerCode);
      if (!document || !provider) {
        throw new Error(
          `Missing dependency for analysis: doc=${item.filename}, provider=${item.providerCode}`,
        );
      }

      // Idempotent: skip if this (document, provider) analysis already exists
      const existing = await this.prisma.analysis.findFirst({
        where: {
          documentId: document.id,
          process: { aiProviderId: provider.id },
        },
        include: {
          document: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });
      if (existing) {
        created.push(existing);
        continue;
      }

      const fromTime = new Date();
      const toTime = new Date(fromTime.getTime() + 1500); // simulate 1.5s
      const analysis = await this.prisma.analysis.create({
        data: {
          document: { connect: { id: document.id } },
          process: {
            create: {
              aiProvider: { connect: { id: provider.id } },
              fromTime,
              toTime,
              cost: 0.01,
              status: 'completed',
              result: item.result,
              response: item.response,
            },
          },
        },
        include: {
          document: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });
      created.push(analysis);
    }

    this.logger.log(`Seeded ${created.length} analyses`);
    return created;
  }

  /**
   * Seeds 2 comparisons:
   *   1. Same document, two providers — Carrefour PO compared by Anthropic vs OpenAI
   *      (cross-provider quality comparison)
   *   2. Two different documents — Carrefour PO vs Tesco invoice
   *      (side-by-side document comparison)
   *
   * Each comparison owns a `Process` row whose `result` contains the mock
   * structured diff and `response` contains a natural-language summary.
   *
   * Idempotent: skips if a comparison with the same (documentAId, documentBId)
   * pair already exists.
   */
  async seedComparisons() {
    const documents = await this.prisma.document.findMany();
    const providers = await this.prisma.aiProvider.findMany();

    const docByFilename = new Map(documents.map((d) => [d.filename, d]));
    const providerByCode = new Map(providers.map((p) => [p.code, p]));

    const carrefour = docByFilename.get('purchase-order-carrefour.edi');
    const tesco = docByFilename.get('invoice-tesco.xml');
    const anthropic = providerByCode.get('anthropic');

    if (!carrefour || !tesco || !anthropic) {
      throw new Error('Comparisons seed requires Carrefour PO, Tesco invoice, and Anthropic provider');
    }

    const plan = [
      {
        documentA: carrefour,
        documentB: carrefour, // same document — provider quality comparison
        provider: anthropic,
        result: {
          comparisonType: 'cross_provider',
          providerA: 'anthropic',
          providerB: 'openai',
          agreement: {
            documentType: true,
            orderNumber: true,
            deliveryDate: true,
            lineItemCount: true,
          },
          differences: {
            buyerDetail: {
              anthropic: 'Carrefour (GLN 5412345678908)',
              openai: 'Carrefour',
              note: 'Anthropic extracted the GLN identifier; OpenAI returned only the trading name.',
            },
            supplierDetail: {
              anthropic: 'GLN 4012345000009',
              openai: 'Plant Milk Supplier',
              note: 'OpenAI inferred a descriptive supplier label; Anthropic stayed verbatim with the GLN.',
            },
          },
          recommendation:
            'Anthropic produced the more conservative, verifiable extraction. OpenAI added inferred labels which are more readable but harder to audit.',
        },
        response:
          'Both providers correctly identified the document as a Carrefour purchase order PO-2026-04-001 with delivery on 2026-04-20 and 3 line items. Anthropic preserved the raw GLN identifiers for buyer and supplier; OpenAI replaced them with friendlier names ("Carrefour", "Plant Milk Supplier"). For audit trails Anthropic\'s output is preferable; for human-facing UIs OpenAI\'s is easier to read.',
      },
      {
        documentA: carrefour,
        documentB: tesco, // two different documents
        provider: anthropic,
        result: {
          comparisonType: 'cross_document',
          documentA: { type: 'purchase_order', code: 'PO-2026-04-001', currency: 'EUR' },
          documentB: { type: 'invoice', code: 'INV-2026-04-0042', currency: 'GBP' },
          differences: {
            documentType: 'purchase_order vs invoice',
            currency: 'EUR vs GBP',
            parties: 'Carrefour↔plant-milk supplier vs Fresh Produce Ltd↔Tesco Stores Ltd',
            productCategory: 'plant-based milks vs organic produce (bananas, apples)',
            lineItems: '3 lines (1,000 units) vs 2 lines (600 units)',
            financials: 'no totals on PO vs £1,200 net + £240 VAT = £1,440 on invoice',
          },
          relationship: 'unrelated',
          summary:
            'These are two unrelated EDI documents from different retailers with no overlapping references.',
        },
        response:
          'Carrefour PO-2026-04-001 and Tesco invoice INV-2026-04-0042 are unrelated documents from different retailers. The PO orders 1,000 cartons of plant-based milk in EUR; the invoice bills £1,440 for 600 kg of organic bananas and apples. They share no order references, products, or parties.',
      },
    ];

    const created: unknown[] = [];
    for (const item of plan) {
      const existing = await this.prisma.comparison.findFirst({
        where: {
          documentAId: item.documentA.id,
          documentBId: item.documentB.id,
        },
        include: {
          documentA: { select: { code: true, filename: true, storagePath: true } },
          documentB: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });
      if (existing) {
        created.push(existing);
        continue;
      }

      const fromTime = new Date();
      const toTime = new Date(fromTime.getTime() + 2200); // simulate 2.2s
      const comparison = await this.prisma.comparison.create({
        data: {
          documentA: { connect: { id: item.documentA.id } },
          documentB: { connect: { id: item.documentB.id } },
          process: {
            create: {
              aiProvider: { connect: { id: item.provider.id } },
              fromTime,
              toTime,
              cost: 0.02,
              status: 'completed',
              result: item.result,
              response: item.response,
            },
          },
        },
        include: {
          documentA: { select: { code: true, filename: true, storagePath: true } },
          documentB: { select: { code: true, filename: true, storagePath: true } },
          process: { include: { aiProvider: { select: { code: true, name: true } } } },
        },
      });
      created.push(comparison);
    }

    this.logger.log(`Seeded ${created.length} comparisons`);
    return created;
  }
}
