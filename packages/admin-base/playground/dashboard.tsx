import { useMemo, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AdminDashboard, type DashboardGraph } from '../src/index.js';

const RANGES = [
  { value: '1h', label: '1s' },
  { value: '2h', label: '2s' },
  { value: '7d', label: '7g' },
  { value: '1mo', label: '1ay' }
];

function seriesFor(range: string): number[] {
  if (range === '1h') return [4, 8, 6, 11, 9, 14];
  if (range === '2h') return [6, 10, 8, 15, 12, 18, 11, 9];
  if (range === '1mo') return [20, 32, 28, 40, 36, 44];
  return [12, 18, 15, 22, 19, 27, 24];
}

function labelsFor(range: string): string[] {
  return seriesFor(range).map((_, index) => `${range}-${index + 1}`);
}

/** Örnek: 4 kart, tam genişlik trafik (aralık düğmeli), iki yarım grafik, tablo, kısayollar. */
export function DashboardDemo() {
  const [range, setRange] = useState('7d');
  const traffic: DashboardGraph = useMemo(
    () => ({
      id: 'traffic',
      title: 'API trafiği',
      type: 'line',
      fullWidth: true,
      labels: labelsFor(range),
      series: [{ label: 'İstek', data: seriesFor(range) }],
      range: { value: range, options: RANGES, onChange: setRange }
    }),
    [range]
  );

  return (
    <MemoryRouter>
      <AdminDashboard
        cards={[
          { id: 'users', label: 'Kullanıcılar', value: '1.284' },
          { id: 'api', label: 'API bugün', value: '932' },
          { id: 'deep24', label: 'Deep Dive (24s)', value: '18' },
          { id: 'deep7', label: 'Deep Dive (7g)', value: '76' }
        ]}
        graphs={[
          traffic,
          {
            id: 'a',
            title: 'Koleksiyon A',
            type: 'bar',
            labels: ['users', 'logs', 'jobs'],
            series: [{ label: 'Adet', data: [120, 80, 40] }]
          },
          {
            id: 'b',
            title: 'Koleksiyon B',
            type: 'bar',
            labels: ['fx', 'funds'],
            series: [{ label: 'Adet', data: [30, 55] }]
          }
        ]}
        tables={[
          {
            id: 'jobs',
            title: 'Son işler',
            columns: [
              { key: 'job', label: 'İş' },
              { key: 'status', label: 'Durum', kind: 'status' },
              { key: 'runAt', label: 'Zaman' }
            ],
            rows: [
              { job: 'refresh_live_quotes', status: 'success', runAt: '2026-10-28 08:00' },
              { job: 'cleanup_caches', status: 'failed', runAt: '2026-10-28 03:10' }
            ]
          }
        ]}
        links={[
          { to: '/users', title: 'Kullanıcılar', subtitle: 'Liste ve plan' },
          { to: '/jobs', title: 'İşler', subtitle: 'Tetikleme ve kayıt' },
          { to: '/metrics', title: 'Metrikler', subtitle: 'Özet' }
        ]}
      />
    </MemoryRouter>
  );
}
