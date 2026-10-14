import { getDealers } from '../lib/assignDealer';

/**
 * Read-only routing table rendered from data-out/dealers.json.
 * This is real reference data (8 dealers), not lead statistics.
 */
export function DealerRoster() {
  const dealers = getDealers();

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Dealer routing table</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Loaded from data-out/dealers.json, generated from data/dealers.csv by the Phase 1 script.
          A lead&apos;s first three pincode digits pick its dealer.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">ID</th>
              <th className="px-5 py-3 font-medium">Dealer</th>
              <th className="px-5 py-3 font-medium">City</th>
              <th className="px-5 py-3 font-medium">Pincode prefixes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dealers.map((dealer) => (
              <tr key={dealer.dealer_id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{dealer.dealer_id}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{dealer.dealer_name}</td>
                <td className="px-5 py-3 text-slate-600">{dealer.city}</td>
                <td className="px-5 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    {dealer.pincode_prefixes.map((prefix) => (
                      <span
                        key={prefix}
                        className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-700"
                      >
                        {prefix}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
