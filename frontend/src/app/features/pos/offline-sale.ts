import { CashSession, PaymentMethod, PosConfig, Sale, SaleInput, SaleItem, SalePayment, SaleTax, TaxType } from '../../core/api/api.models';
import { CartLine, PaymentDraft, lineAmounts, linePrice, money, summarizePayments } from './sale-math';

/** Impuesto de la línea según la copia del catálogo (el carrito solo guarda la tarifa). */
export interface LineTax {
  taxId: string;
  taxType: TaxType | string;
}

export interface OfflineSaleData {
  id: string;
  number: string;
  soldAt: string;
  input: SaleInput;
  lines: readonly CartLine[];
  payments: readonly PaymentDraft[];
  methods: readonly PaymentMethod[];
  config: PosConfig;
  session: CashSession;
  userId: string;
  userName: string;
  taxOf: (line: CartLine) => LineTax;
}

/**
 * El tiquete de una venta hecha sin internet (decisión 332), armado en el equipo con la misma cuenta del carrito: sale
 * con el número provisional y "Pendiente de enviar". Cuando llega al servidor, la venta toma su número oficial.
 */
export function offlineSale(d: OfflineSaleData): Sale {
  const include = d.config.pricesIncludeTax;
  const items: SaleItem[] = d.lines.map((l, i) => {
    const a = lineAmounts(linePrice(l), l.quantity, l.discountPercent, l.taxRate, include);
    return {
      lineNo: i + 1, productId: l.productId, sku: l.sku, name: l.name, unitId: l.unitId, unitCode: l.unitCode,
      quantity: l.quantity, unitPrice: linePrice(l), grossAmount: a.gross, discountPercent: l.discountPercent,
      discountAmount: a.discount, taxType: d.taxOf(l).taxType, taxRate: l.taxRate, taxableBase: a.base,
      taxAmount: a.tax, total: a.total, note: l.note ?? null,
    };
  });
  const taxes = new Map<string, SaleTax>();
  items.forEach((item, i) => {
    const tax = d.taxOf(d.lines[i]);
    const acc = taxes.get(tax.taxId) ?? { taxId: tax.taxId, taxType: item.taxType, taxRate: item.taxRate, taxableBase: 0, taxAmount: 0 };
    acc.taxableBase = money(acc.taxableBase + item.taxableBase);
    acc.taxAmount = money(acc.taxAmount + item.taxAmount);
    taxes.set(tax.taxId, acc);
  });
  const sum = (pick: (i: SaleItem) => number) => money(items.reduce((s, i) => s + pick(i), 0));
  const total = sum((i) => i.total);
  const summary = summarizePayments(total, [...d.payments]);
  let changeLeft = summary.change;
  const payments: SalePayment[] = d.payments.map((p, i) => {
    const method = d.methods.find((m) => m.id === p.methodId);
    const tendered = Number(p.amount ?? 0);
    // El cambio sale del efectivo: lo aplicado es lo entregado menos el cambio.
    const change = p.affectsCash ? Math.min(changeLeft, tendered) : 0;
    changeLeft = money(changeLeft - change);
    return {
      lineNo: i + 1, paymentMethodId: p.methodId, methodCode: method?.code ?? '', methodName: method?.name ?? '',
      amount: money(tendered - change), tendered, reference: p.reference.trim() || null,
    };
  });
  const s = d.session;
  return {
    id: d.id, documentNumber: d.number, prefix: 'SC', number: 0, status: 'COMPLETED', createdAt: d.soldAt,
    branchId: s.branchId, cashRegisterId: s.cashRegisterId, cashSessionId: s.id, customerId: d.config.finalConsumerId,
    customerDocumentType: 'CC', customerDocumentNumber: '222222222222', customerVerificationDigit: null,
    customerName: 'Consumidor Final', pricesIncludeTax: include, grossTotal: sum((i) => i.grossAmount),
    discountTotal: sum((i) => i.discountAmount), subtotal: sum((i) => i.taxableBase), taxTotal: sum((i) => i.taxAmount),
    total, paidTotal: summary.paid, changeAmount: summary.change, notes: null, createdBy: d.userId,
    createdByName: d.userName, voidedAt: null, voidedBy: null, voidedByName: null, voidReason: null, items, payments,
    taxes: [...taxes.values()],
    receipt: {
      businessName: d.config.businessName, branchName: s.branchName, branchAddress: null, branchPhone: null,
      registerCode: s.registerCode, registerName: s.registerName, footer: d.config.receiptFooter, timezone: null,
      header: d.config.receiptHeader ?? null,
    },
    offlineNumber: d.number,
    pendingSync: true,
  };
}
