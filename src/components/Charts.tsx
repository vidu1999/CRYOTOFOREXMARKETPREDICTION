import { useId, useLayoutEffect, useMemo, useState } from 'react';
import { ChartCandlestick, ChartNoAxesCombined, Minus, Plus } from 'lucide-react';
import type { Analysis, Asset, Candle, Timeframe } from '../lib/types';
import { formatPrice, formatTime, money } from '../lib/market';
import { AssetIcon } from './UI';

const GREEN = '#59e5b3';
const RED = '#ed8593';
const BLUE = '#8295ee';
const AMBER = '#d9b778';

function useChartWidth() {
  const [element, ref] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(960);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(
        Math.max(
          260,
          element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref, width };
}

function linePath(values: number[], x: (i: number) => number, y: (v: number) => number) {
  return values
    .map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`)
    .join(' ');
}

export function Sparkline({
  values,
  color = GREEN,
  className = '',
  fill = false,
}: {
  values: number[];
  color?: string;
  className?: string;
  fill?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = linePath(
    values,
    (i) => (i / (values.length - 1)) * 118 + 1,
    (v) => 36 - ((v - min) / range) * 31,
  );
  return (
    <svg className={`sparkline ${className}`} viewBox="0 0 120 42" aria-hidden="true">
      <defs>
        <linearGradient id={`spark${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${path} L119,42 L1,42 Z`} fill={`url(#spark${id})`} />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface PriceChartProps {
  asset: Asset;
  candles: Candle[];
  analysis: Analysis;
  timeframe: Timeframe;
  source: string;
  timeframes: React.ReactNode;
}
export function PriceChart({
  asset,
  candles,
  analysis,
  timeframe,
  source,
  timeframes,
}: PriceChartProps) {
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles');
  const [count, setCount] = useState(76);
  const [hover, setHover] = useState<number | null>(null);
  const [showEma, setShowEma] = useState(true);
  const id = useId().replace(/:/g, '');
  const { ref: chartRef, width } = useChartWidth();
  const effectiveCount = width < 500 ? Math.round(count * 0.65) : count;
  const data = useMemo(() => candles.slice(-effectiveCount), [candles, effectiveCount]);
  const points = analysis.points.slice(-data.length);
  const left = width < 500 ? 9 : 16;
  const right = width < 500 ? 77 : 94;
  const top = 17;
  const bottom = 201;
  const plotWidth = width - left - right;
  const priceMin = Math.min(
    ...data.map((c) => c.low),
    ...(showEma ? points.flatMap((p) => [p.ema20, p.ema50]) : []),
  );
  const priceMax = Math.max(
    ...data.map((c) => c.high),
    ...(showEma ? points.flatMap((p) => [p.ema20, p.ema50]) : []),
  );
  const padding = Math.max((priceMax - priceMin) * 0.12, analysis.price * 0.0001);
  const min = priceMin - padding;
  const max = priceMax + padding;
  const x = (i: number) => left + ((i + 0.5) / data.length) * plotWidth;
  const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
  const maxVolume = Math.max(...data.map((c) => c.volume), 1);
  const last = data[data.length - 1];
  const selected = hover === null ? last : data[Math.min(hover, data.length - 1)];
  const priceColor = last.close >= last.open ? GREEN : RED;
  const candleWidth = Math.max(1.4, (plotWidth / data.length) * 0.6);
  const pricePath = linePath(
    data.map((c) => c.close),
    x,
    y,
  );
  const ticks = [0, 1, 2, 3, 4];

  return (
    <section className="panel price-panel">
      <div className="price-chart-heading">
        <div className="instrument-title">
          <AssetIcon asset={asset} />
          <div>
            <h2>
              {asset.id === 'imported'
                ? asset.pair
                : asset.category === 'Crypto'
                  ? `${asset.name} / US Dollar`
                  : asset.name}
            </h2>
            <div className="instrument-meta">
              {asset.pair}
              <span>·</span>
              <span className="source-label">{source}</span>
            </div>
          </div>
        </div>
        <div className="chart-type-toggle" aria-label="Chart style">
          <button
            className={chartType === 'candles' ? 'active' : ''}
            aria-label="Candlestick chart"
            aria-pressed={chartType === 'candles'}
            onClick={() => setChartType('candles')}
          >
            <ChartCandlestick size={17} />
          </button>
          <button
            className={chartType === 'line' ? 'active' : ''}
            aria-label="Line chart"
            aria-pressed={chartType === 'line'}
            onClick={() => setChartType('line')}
          >
            <ChartNoAxesCombined size={17} />
          </button>
        </div>
      </div>
      <div className="chart-toolbar">
        {timeframes}
        <div className="chart-zoom">
          <button
            className="icon-button"
            onClick={() => {
              setCount(Math.min(160, count + 28));
              setHover(null);
            }}
            disabled={count >= 160}
            title="Show more candles"
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setCount(Math.max(28, count - 24));
              setHover(null);
            }}
            disabled={count <= 28}
            title="Show fewer candles"
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="ohlc-line">
        <span className="ohlc-time">
          {new Date(selected.time).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}{' '}
          · {formatTime(selected.time, timeframe)}
        </span>
        {(['open', 'high', 'low', 'close'] as const).map((key) => (
          <span key={key}>
            <b>{key[0].toUpperCase()}</b>{' '}
            <span
              className={
                key === 'close' ? (selected.close >= selected.open ? 'positive' : 'negative') : ''
              }
            >
              {formatPrice(selected[key], asset)}
            </span>
          </span>
        ))}
      </div>
      <div className="price-chart" ref={chartRef}>
        <svg
          viewBox={`0 0 ${width} 282`}
          role="img"
          aria-label={`${asset.pair} ${timeframe} ${chartType} chart showing the last ${data.length} completed candles and EMA 20 and 50`}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const offset = ((event.clientX - rect.left) / rect.width) * width;
            if (offset >= left && offset <= width - right)
              setHover(
                Math.max(
                  0,
                  Math.min(
                    data.length - 1,
                    Math.floor(((offset - left) / plotWidth) * data.length),
                  ),
                ),
              );
            else setHover(null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`pricefill${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity="0.18" />
              <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => {
            const value = max - (t / 4) * (max - min);
            return (
              <g key={t}>
                <line
                  x1={left}
                  y1={y(value)}
                  x2={width - right}
                  y2={y(value)}
                  className="chart-grid"
                />
                <text x={width - right + 13} y={y(value) + 4} className="axis-label">
                  {formatPrice(value, asset)}
                </text>
              </g>
            );
          })}
          {Array.from({ length: width < 500 ? 4 : 6 }, (_, i) => i).map((i) => {
            const index = Math.round((i / (width < 500 ? 3 : 5)) * (data.length - 1));
            return (
              <g key={i}>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={top}
                  y2={250}
                  className="chart-grid vertical"
                />
                <text x={x(index)} y="275" textAnchor="middle" className="axis-label">
                  {formatTime(data[index].time, timeframe)}
                </text>
              </g>
            );
          })}
          <line x1={left} x2={width - right} y1="220" y2="220" className="chart-grid" />
          {data.map((c, i) => (
            <g key={c.time}>
              {chartType === 'candles' && (
                <>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(c.high)}
                    y2={y(c.low)}
                    stroke={c.close >= c.open ? GREEN : RED}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={x(i) - candleWidth / 2}
                    y={Math.min(y(c.open), y(c.close))}
                    width={candleWidth}
                    height={Math.max(1.3, Math.abs(y(c.open) - y(c.close)))}
                    rx="0.65"
                    fill={c.close >= c.open ? GREEN : RED}
                  />
                </>
              )}
              <rect
                x={x(i) - candleWidth / 2}
                y={252 - (c.volume / maxVolume) * 25}
                width={candleWidth}
                height={(c.volume / maxVolume) * 25}
                rx="0.7"
                fill={c.close >= c.open ? GREEN : RED}
                opacity="0.25"
              />
            </g>
          ))}
          {chartType === 'line' && (
            <>
              <path
                d={`${pricePath} L${x(data.length - 1)},${bottom} L${x(0)},${bottom} Z`}
                fill={`url(#pricefill${id})`}
              />
              <path
                d={pricePath}
                fill="none"
                stroke={GREEN}
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
            </>
          )}
          {showEma && (
            <>
              <path
                d={linePath(
                  points.map((p) => p.ema20),
                  x,
                  y,
                )}
                fill="none"
                stroke={AMBER}
                strokeWidth="1.4"
                opacity="0.8"
              />
              <path
                d={linePath(
                  points.map((p) => p.ema50),
                  x,
                  y,
                )}
                fill="none"
                stroke={BLUE}
                strokeWidth="1.4"
                opacity="0.8"
              />
            </>
          )}
          <line
            x1={left}
            x2={width - right + 2}
            y1={y(last.close)}
            y2={y(last.close)}
            stroke={priceColor}
            strokeDasharray="3 5"
            opacity="0.55"
          />
          <rect
            x={width - right + 2}
            y={y(last.close) - 12}
            width={right - 5}
            height="24"
            rx="4"
            fill={priceColor}
          />
          <text
            x={width - right / 2}
            y={y(last.close) + 4}
            textAnchor="middle"
            fill="#0a251e"
            fontSize="11"
            fontWeight="700"
          >
            {formatPrice(last.close, asset)}
          </text>
          {hover !== null && (
            <g>
              <line
                x1={x(Math.min(hover, data.length - 1))}
                x2={x(Math.min(hover, data.length - 1))}
                y1={top}
                y2={253}
                stroke="#8592a8"
                strokeDasharray="3 4"
              />
              <line
                x1={left}
                x2={width - right}
                y1={y(selected.close)}
                y2={y(selected.close)}
                stroke="#8592a8"
                strokeDasharray="3 4"
              />
              <circle
                cx={x(Math.min(hover, data.length - 1))}
                cy={y(selected.close)}
                r="3"
                fill={GREEN}
                stroke="#101721"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>
      <div className="chart-footer">
        <div className="chart-legend">
          <button
            onClick={() => setShowEma(!showEma)}
            aria-label="Toggle EMA overlays"
            aria-pressed={showEma}
            className={!showEma ? 'muted' : ''}
          >
            <span className="legend-dot amber" />
            EMA 20
            <span className="legend-dot purple" />
            EMA 50
          </button>
          <span>
            <span className="legend-dot volume" />
            Volume
          </span>
        </div>
        <span className="chart-timezone">Closed candles · UTC</span>
      </div>
    </section>
  );
}

export interface PlotPoint {
  value: number;
  label?: string;
}
export function LineChart({
  points,
  secondary,
  secondary2,
  color = GREEN,
  label = 'Value chart',
  dollar = true,
  height = 260,
}: {
  points: PlotPoint[];
  secondary?: PlotPoint[];
  secondary2?: PlotPoint[];
  color?: string;
  label?: string;
  dollar?: boolean;
  height?: number;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const { ref: chartRef, width } = useChartWidth();
  if (!points.length) return <div className="chart-empty">No observations yet.</div>;
  const all = [...points, ...(secondary ?? []), ...(secondary2 ?? [])].map((p) => p.value);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || Math.max(Math.abs(max) * 0.05, 1);
  const left = 10;
  const right = width < 500 ? 70 : 88;
  const top = 26;
  const bottom = height - 30;
  const lo = min - range * 0.12;
  const hi = max + range * 0.12;
  const x = (i: number) => left + (i / Math.max(1, points.length - 1)) * (width - left - right);
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const path = linePath(
    points.map((p) => p.value),
    x,
    y,
  );
  const valueFormat = (value: number) => (dollar ? money(value) : value.toFixed(2));
  const activeHover = hover === null ? null : Math.min(hover, points.length - 1);
  return (
    <div className="line-chart" ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * width;
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((px - left) / (width - left - right)) * (points.length - 1)),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`equity${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((t) => {
          const v = hi - (t / 3) * (hi - lo);
          return (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="chart-grid" />
              <text x={width - right + 16} y={y(v) + 4} className="axis-label">
                {valueFormat(v)}
              </text>
            </g>
          );
        })}
        <path
          d={`${path} L${x(points.length - 1)},${bottom} L${x(0)},${bottom} Z`}
          fill={`url(#equity${id})`}
        />
        {secondary && (
          <path
            d={linePath(
              secondary.map((p) => p.value),
              x,
              y,
            )}
            fill="none"
            stroke={RED}
            strokeWidth="1.7"
            strokeDasharray="5 5"
          />
        )}
        {secondary2 && (
          <path
            d={linePath(
              secondary2.map((p) => p.value),
              x,
              y,
            )}
            fill="none"
            stroke={BLUE}
            strokeWidth="1.7"
            strokeDasharray="5 5"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {[0, 1, 2, 3, 4].map((t) => {
          const i = Math.round((t / 4) * (points.length - 1));
          return (
            <text
              key={t}
              x={x(i)}
              y={height - 6}
              textAnchor={t === 0 ? 'start' : 'middle'}
              className="axis-label"
            >
              {points[i].label ?? `${i}`}
            </text>
          );
        })}
        {activeHover !== null && (
          <g>
            <line
              x1={x(activeHover)}
              x2={x(activeHover)}
              y1={top}
              y2={bottom}
              stroke="#718198"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(activeHover)}
              cy={y(points[activeHover].value)}
              r="4"
              fill={color}
              stroke="#111822"
              strokeWidth="2"
            />
            <rect
              x={Math.max(left, Math.min(width - right - 118, x(activeHover) - 58))}
              y="3"
              width="118"
              height="24"
              rx="5"
              fill="#2a3647"
            />
            <text
              x={Math.max(left, Math.min(width - right - 118, x(activeHover) - 58)) + 59}
              y="19"
              fill="#e7edf4"
              textAnchor="middle"
              fontSize="11"
            >
              {valueFormat(points[activeHover].value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export function ScenarioChart({
  candles,
  analysis,
  asset,
}: {
  candles: Candle[];
  analysis: Analysis;
  asset: Asset;
}) {
  const { ref: chartRef, width } = useChartWidth();
  const historical = candles.slice(-32).map((c) => c.close);
  const steps = 12;
  const forecast = Array.from({ length: steps + 1 }, (_, i) =>
    Math.max(
      analysis.price * 0.001,
      analysis.price + analysis.score * analysis.indicators.atr * 0.35 * i,
    ),
  );
  const upper = forecast.map((v, i) => v + Math.sqrt(i) * analysis.indicators.atr);
  const lower = forecast.map((v, i) => Math.max(0, v - Math.sqrt(i) * analysis.indicators.atr));
  const max = Math.max(...historical, ...upper);
  const min = Math.min(...historical, ...lower);
  const pad = (max - min) * 0.12 || 1;
  const w = width,
    l = 12,
    r = width < 500 ? 78 : 98,
    t = 30,
    b = 222;
  const count = historical.length + steps;
  const x = (i: number) => l + (i / (count - 1)) * (w - l - r);
  const y = (v: number) => b - ((v - min + pad) / (max - min + 2 * pad)) * (b - t);
  const offset = historical.length - 1;
  const forecastPath = linePath(forecast, (i) => x(i + offset), y);
  const band = `${linePath(upper, (i) => x(i + offset), y)} ${lower
    .slice()
    .reverse()
    .map((v, i) => `L${x(offset + steps - i)},${y(v)}`)
    .join(' ')} Z`;
  return (
    <div className="scenario-chart" ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} 260`}
        role="img"
        aria-label="Illustrative, uncalibrated future price scenarios, not a price guarantee"
      >
        <rect
          x={x(offset)}
          y={t}
          width={x(count - 1) - x(offset)}
          height={b - t}
          fill={GREEN}
          opacity="0.025"
        />
        {[0, 1, 2, 3, 4].map((i) => {
          const v = max + pad - (i / 4) * (max - min + 2 * pad);
          return (
            <g key={i}>
              <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} className="chart-grid" />
              <text x={w - r + 14} y={y(v) + 4} className="axis-label">
                {formatPrice(v, asset)}
              </text>
            </g>
          );
        })}
        <path d={band} fill={GREEN} opacity="0.08" />
        <path d={linePath(historical, x, y)} fill="none" stroke="#8e9eaf" strokeWidth="2" />
        <path
          d={linePath(upper, (i) => x(i + offset), y)}
          fill="none"
          stroke={GREEN}
          opacity="0.4"
          strokeDasharray="3 4"
        />
        <path
          d={linePath(lower, (i) => x(i + offset), y)}
          fill="none"
          stroke={GREEN}
          opacity="0.4"
          strokeDasharray="3 4"
        />
        <path d={forecastPath} fill="none" stroke={GREEN} strokeWidth="2.2" strokeDasharray="5 4" />
        <line x1={x(offset)} x2={x(offset)} y1={t} y2={b} stroke="#66798e" strokeDasharray="3 5" />
        <circle cx={x(offset)} cy={y(analysis.price)} r="4" fill={GREEN} />
        <text x={Math.max(l + 55, x(offset) - 10)} y="18" textAnchor="end" className="axis-label">
          HISTORICAL
        </text>
        <text x={x(offset) + 12} y="18" fill={GREEN} fontSize="10" letterSpacing="1.2">
          SCENARIOS
        </text>
        <text x={l} y="249" className="axis-label">
          {width < 500 ? 'History' : '32 previous candles'}
        </text>
        <text x={x(offset)} y="249" className="axis-label" textAnchor="middle">
          Last close
        </text>
        <text x={w - r} y="249" className="axis-label" textAnchor="end">
          {width < 500 ? '+12' : '+12 candles'}
        </text>
      </svg>
    </div>
  );
}
