import { Box, Card, CardActionArea, CardContent, Chip, Paper, ToggleButton, ToggleButtonGroup, Typography, useTheme } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions
} from 'chart.js';
import type { ReactNode } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { groupDashboardGraphs } from './layout.js';
import { useAdminTexts } from '../useAdminTexts.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const SERIES_COLORS = ['#2563eb', '#0f766e', '#c2410c', '#6d28d9', '#be123c'];

export type DashboardCard = {
  id: string;
  label: string;
  value: string;
};

export type DashboardGraphSeries = {
  label: string;
  data: number[];
};

export type DashboardGraphRange = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export type DashboardGraph = {
  id: string;
  title: string;
  type: 'line' | 'bar';
  labels: string[];
  series: DashboardGraphSeries[];
  /** Kendi satırında, tam genişlik. Yoksa aynı gruptaki grafiklerle eşit bölünür. */
  fullWidth?: boolean;
  /** Doluysa grafik çizilmez; aralık düğmesi durur. */
  emptyMessage?: string;
  range?: DashboardGraphRange;
};

export type DashboardTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** `status` metni renkli bir chip olarak basar. */
  kind?: 'text' | 'status';
};

export type DashboardTable = {
  id: string;
  title: string;
  columns: DashboardTableColumn[];
  rows: Record<string, ReactNode>[];
};

export type DashboardLink = {
  to: string;
  title: string;
  subtitle?: string;
};

export type AdminDashboardProps = {
  cards?: DashboardCard[];
  graphs?: DashboardGraph[];
  tables?: DashboardTable[];
  links?: DashboardLink[];
};

function chartColors(theme: Theme) {
  const tick = theme.palette.text.secondary;
  const grid = theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  return {
    legend: tick,
    scale: {
      ticks: { color: tick, maxRotation: 0, autoSkipPadding: 12 },
      grid: { color: grid },
      border: { color: theme.palette.divider }
    }
  };
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  const value = status.toLowerCase();
  if (value === 'success' || value === 'succeeded') return 'success';
  if (value === 'partial' || value === 'processing') return 'warning';
  if (value === 'failed' || value === 'failure') return 'error';
  if (value === 'skipped' || value === 'deleted') return 'info';
  return 'default';
}

function GraphBlock({ graph }: { graph: DashboardGraph }) {
  const theme = useTheme();
  const { text } = useAdminTexts();
  const colors = chartColors(theme);
  const data: ChartData<'line' | 'bar'> = {
    labels: graph.labels,
    datasets: graph.series.map((series, index) => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      return {
        label: series.label,
        data: series.data,
        borderColor: color,
        backgroundColor: graph.type === 'line' ? `${color}26` : `${color}8c`,
        tension: 0.3,
        fill: graph.type === 'line',
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2
      };
    })
  };
  const options: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: graph.series.length > 1, labels: { color: colors.legend, boxWidth: 10, boxHeight: 10 } }
    },
    scales: {
      x: colors.scale,
      y: { beginAtZero: true, ...colors.scale, ticks: { ...colors.scale.ticks, precision: 0 } }
    }
  };

  return (
    <Paper variant='outlined' sx={{ p: 2.5, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant='subtitle1' sx={{ fontWeight: 650 }}>
          {graph.title}
        </Typography>
        {graph.range && graph.range.options.length > 0 ? (
          <ToggleButtonGroup
            exclusive
            size='small'
            value={graph.range.value}
            onChange={(_, next: string | null) => {
              if (next) graph.range?.onChange(next);
            }}
            aria-label={text('dashboardRange')}
          >
            {graph.range.options.map(option => (
              <ToggleButton key={option.value} value={option.value} sx={{ px: 1.25, textTransform: 'none' }}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : null}
      </Box>
      <Box sx={{ flex: 1, minHeight: 240 }}>
        {graph.emptyMessage ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              {graph.emptyMessage}
            </Typography>
          </Box>
        ) : graph.type === 'bar' ? (
          <Bar data={data as ChartData<'bar'>} options={options as ChartOptions<'bar'>} />
        ) : (
          <Line data={data as ChartData<'line'>} options={options as ChartOptions<'line'>} />
        )}
      </Box>
    </Paper>
  );
}

function cellValue(column: DashboardTableColumn, value: ReactNode) {
  if (value == null || value === '') return '—';
  if (column.kind === 'status' && typeof value === 'string') {
    return <Chip size='small' variant='outlined' label={value} color={statusColor(value)} />;
  }
  return value;
}

/** Hazır dizileri basar. Boş dizi o bölümü çizmez. Alan adı tanımaz. */
export function AdminDashboard({ cards = [], graphs = [], tables = [], links = [] }: AdminDashboardProps) {
  const { text } = useAdminTexts();
  const graphRows = groupDashboardGraphs(graphs);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
      {cards.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(180px, 1fr))' }
          }}
        >
          {cards.map(card => (
            <Card key={card.id} variant='outlined' sx={{ borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
              <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: 'primary.main', opacity: 0.85 }} />
              <CardContent sx={{ pt: 2.5, pb: '16px !important' }}>
                <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 600, letterSpacing: '0.04em' }}>
                  {card.label}
                </Typography>
                <Typography variant='h4' sx={{ fontWeight: 650, mt: 0.75, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : null}

      {graphRows.map((row, index) => (
        <Box
          key={row.map(graph => graph.id).join('-') || index}
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: `repeat(${row.length}, minmax(0, 1fr))` }
          }}
        >
          {row.map(graph => (
            <GraphBlock key={graph.id} graph={graph} />
          ))}
        </Box>
      ))}

      {tables.map(table => (
        <Paper key={table.id} variant='outlined' sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Typography variant='subtitle1' sx={{ fontWeight: 650, px: 2.5, pt: 2, pb: 1.5 }}>
            {table.title}
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Box
              component='table'
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                '& th, & td': {
                  py: 1.25,
                  px: 2,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  whiteSpace: 'nowrap',
                  textAlign: 'left'
                },
                '& th[data-align="right"], & td[data-align="right"]': { textAlign: 'right' },
                '& th': { color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.02em' }
              }}
            >
              <thead>
                <tr>
                  {table.columns.map(column => (
                    <Box component='th' key={column.key} data-align={column.align === 'right' ? 'right' : 'left'}>
                      {column.label}
                    </Box>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 ? (
                  <tr>
                    <Box component='td' colSpan={Math.max(table.columns.length, 1)} sx={{ color: 'text.secondary' }}>
                      {text('noRows')}
                    </Box>
                  </tr>
                ) : (
                  table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {table.columns.map(column => (
                        <Box component='td' key={column.key} data-align={column.align === 'right' ? 'right' : 'left'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {cellValue(column, row[column.key])}
                        </Box>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </Box>
          </Box>
        </Paper>
      ))}

      {links.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(240px, 1fr))' }
          }}
        >
          {links.map(link => (
            <Card key={link.to} variant='outlined' sx={{ borderRadius: 2, transition: 'border-color 120ms ease', '&:hover': { borderColor: 'primary.main' } }}>
              <CardActionArea component={RouterLink} to={link.to} sx={{ height: '100%', alignItems: 'stretch' }}>
                <CardContent>
                  <Typography variant='subtitle1' sx={{ fontWeight: 650 }}>
                    {link.title}
                  </Typography>
                  {link.subtitle ? (
                    <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                      {link.subtitle}
                    </Typography>
                  ) : null}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
