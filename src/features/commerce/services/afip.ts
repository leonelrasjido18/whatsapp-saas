import { Order } from "../types";
import { SupabaseClient } from "@supabase/supabase-js";
// @ts-ignore
import Afip from "@afipsdk/afip.js";

/**
 * Emite una Factura C para una orden usando AFIP SDK
 */
export async function createInvoice(
  supabase: SupabaseClient,
  workspaceId: string,
  orderId: string,
  docType: number = 99,
  docNumber: string = "0"
) {
  // 1. Obtener datos de la integracion AFIP
  const { data: integration, error: intError } = await supabase
    .from("integrations")
    .select("credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "afip")
    .single();

  if (intError || !integration) throw new Error("El comercio no tiene configurada la facturación electrónica (Faltan credenciales AFIP).");

  const creds = integration.credentials || {};
  const config = integration.config || {};

  if (!creds.afip_cuit || !config.afip_pto_vta || !creds.afip_cert || !creds.afip_key) {
    throw new Error("El comercio no tiene configurada la facturación electrónica (Faltan credenciales AFIP).");
  }

  // 2. Obtener la orden
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError || !order) throw new Error("Orden no encontrada");
  if (order.status !== "paid") throw new Error("Solo se pueden facturar órdenes pagadas.");
  if (order.invoice_cae) throw new Error("La orden ya fue facturada o está en proceso.");

  // Atomic lock: set invoice_cae to 'PROCESSING' to prevent concurrent requests
  const { data: lockData, error: lockError } = await supabase
    .from("orders")
    .update({ invoice_cae: 'PROCESSING' })
    .eq("id", orderId)
    .is("invoice_cae", null)
    .select("id")
    .single();

  if (lockError || !lockData) {
    throw new Error("La orden ya está siendo facturada por otro proceso.");
  }

  // @ts-ignore
  const afip = new Afip({
    CUIT: parseInt(creds.afip_cuit as string, 10),
    cert: creds.afip_cert,
    key: creds.afip_key,
    access_token: "", // workaround for ts
    production: Boolean(config.afip_production)
  });

  const ptoVta = parseInt(config.afip_pto_vta as string, 10);
  const cbteTipo = 11; // 11 = Factura C

  // Obtener último número de comprobante
  const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
  const nextVoucher = lastVoucher + 1;

  // 4. Preparar payload para la factura
  const date = new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0].replace(/-/g, '');

  const data = {
    'CantReg' 	: 1,  
    'PtoVta' 	: ptoVta,
    'CbteTipo' 	: cbteTipo,
    'Concepto' 	: 1, // 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
    'DocTipo' 	: docType, // 99 = Consumidor Final (default)
    'DocNro' 	: parseInt(docNumber, 10),
    'CbteDesde' : nextVoucher,
    'CbteHasta' : nextVoucher,
    'CbteFch' 	: parseInt(date),
    'ImpTotal' 	: order.total,
    'ImpTotConc': 0,
    'ImpNeto' 	: order.total, // En Fac C es igual al total
    'ImpOpEx' 	: 0,
    'ImpIVA' 	: 0,
    'ImpTrib' 	: 0,
    'MonId' 	: 'PES',
    'MonCotiz' 	: 1
  };

  try {
    // 5. Emitir comprobante
    const res = await afip.ElectronicBilling.createVoucher(data);

    // 6. Guardar el comprobante en la tabla orders
    const invoiceId = `${String(ptoVta).padStart(5, '0')}-${String(nextVoucher).padStart(8, '0')}`;
    
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        invoice_id: invoiceId,
        invoice_cae: res.CAE,
        invoice_cae_vto: res.CAEFchVto
      })
      .eq("id", orderId);

    // 7. Guardar en la nueva tabla invoices
    const { error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: workspaceId,
        order_id: orderId,
        invoice_type: 'C',
        point_of_sale: ptoVta,
        voucher_number: nextVoucher,
        cae: res.CAE,
        cae_expires_at: res.CAEFchVto,
        doc_type: docType,
        doc_number: docNumber
      });

    if (updateError || invoiceError) {
      console.error("[AFIP] Falló al guardar en DB", { updateError, invoiceError });
      throw new Error("Factura generada en AFIP pero falló al guardar en la BD.");
    }

    return {
      invoiceId,
      cae: res.CAE,
      vto: res.CAEFchVto
    };
  } catch (error) {
    // Revert the lock if AFIP failed
    await supabase
      .from("orders")
      .update({ invoice_cae: null })
      .eq("id", orderId)
      .eq("invoice_cae", "PROCESSING");
      
    throw error;
  }
}
