import { PublicLayout } from '../../components/layout/PublicLayout';
import { BarChart2 } from 'lucide-react';

export default function Results() {
  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold mb-4">Results</h1>
        <p className="text-zinc-400 max-w-lg mx-auto mb-16">
          Real signal history will be published here as the system builds a live track record.
          No backtested curves. No cherry-picked trades.
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 max-w-lg mx-auto">
          <BarChart2 size={40} className="text-zinc-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Track record building</h2>
          <p className="text-sm text-zinc-500">
            HashiBot launched recently. Live results from the scanner will appear here
            as signals are created and outcomes recorded. Check back soon.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
