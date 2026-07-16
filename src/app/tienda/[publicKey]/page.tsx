import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicStorefront } from "@/features/storefront/services/storefront";
import { formatArs } from "@/features/commerce/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}): Promise<Metadata> {
  const { publicKey } = await params;
  const store = await getPublicStorefront(publicKey);
  if (!store) return { title: "Tienda no disponible" };
  return {
    title: store.businessName,
    description: store.headline ?? `Catálogo de ${store.businessName}`,
  };
}

function waLink(digits: string | null, productName: string): string | null {
  if (!digits) return null;
  const text = encodeURIComponent(`Hola! Me interesa: ${productName}`);
  return `https://wa.me/${digits}?text=${text}`;
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}) {
  const { publicKey } = await params;
  const store = await getPublicStorefront(publicKey);

  if (!store) notFound();

  const accent = store.accentColor || "#2563eb";
  const generalWa = store.whatsappDigits
    ? `https://wa.me/${store.whatsappDigits}?text=${encodeURIComponent(
        `Hola ${store.businessName}! Quería hacer una consulta.`,
      )}`
    : null;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header
        className="px-6 py-10 text-center text-white"
        style={{ background: accent }}
      >
        <h1 className="text-3xl font-bold tracking-tight">
          {store.businessName}
        </h1>
        {store.headline && (
          <p className="mt-2 text-lg opacity-95">{store.headline}</p>
        )}
        {store.subheadline && (
          <p className="mt-1 text-sm opacity-80">{store.subheadline}</p>
        )}
        {generalWa && (
          <a
            href={generalWa}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2 text-sm font-medium backdrop-blur hover:bg-white/25 transition"
          >
            Escribinos por WhatsApp
          </a>
        )}
      </header>

      {/* Catalog */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        {store.products.length === 0 ? (
          <p className="text-center text-neutral-500 py-16">
            Pronto vas a ver nuestros productos acá.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {store.products.map((p) => {
              const link = waLink(store.whatsappDigits, p.name);
              return (
                <article
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="aspect-square w-full bg-neutral-100">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed remote URL, no next/image loader
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-300 text-xs">
                        Sin foto
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <h2 className="text-sm font-medium leading-tight line-clamp-2">
                      {p.name}
                    </h2>
                    {p.description && (
                      <p className="text-xs text-neutral-500 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-auto pt-2">
                      {store.showPrices && p.price > 0 && (
                        <p className="text-base font-semibold">
                          {formatArs(p.price)}
                        </p>
                      )}
                      {link && (
                        <a
                          href={link}
                          className="mt-2 block rounded-lg px-3 py-2 text-center text-xs font-semibold text-white transition hover:opacity-90"
                          style={{ background: accent }}
                        >
                          Pedir por WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
        {store.businessName} · Catálogo online
      </footer>
    </main>
  );
}
