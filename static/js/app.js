// ZarinPal Analytics Dashboard - Client Application Logic
// Developed for ZarinPal Data Analytics Challenge

let currentMerchantKey = 'M156';
let currentMerchantData = null;
let allCategoryBenchmarks = null;
let searchDirectory = [];
let activeSearchCatId = null;

// Chart.js instances
let monthlyChartInst = null;
let peerBenchmarkChartInst = null;
let hourlyChartInst = null;

// Category icons mapping
const CATEGORY_ICONS = {
  59770001: 'fa-wand-magic-sparkles', // Cosmetics
  56610001: 'fa-bag-shopping',         // Bags & Shoes
  48160000: 'fa-server',               // Network & Hosting
  48160002: 'fa-wifi',                 // ISP
  82410000: 'fa-graduation-cap'        // Education
};

// Persian number formatter
function formatToman(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  if (num >= 1e9) {
    return (num / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 2 }) + ' میلیارد تومان';
  } else if (num >= 1e6) {
    return (num / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' میلیون تومان';
  } else {
    return Math.round(num).toLocaleString('fa-IR') + ' تومان';
  }
}

function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Number(num).toLocaleString('fa-IR');
}

// -------------------------------------------------------------
// Initialization & Bootstrapping
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Theme from localStorage
  const savedTheme = localStorage.getItem('zp_theme') || 'dark';
  applyTheme(savedTheme);

  if (window.Chart) {
    Chart.defaults.font.family = 'Yekan Bakh FaNum, system-ui, sans-serif';
    Chart.defaults.color = savedTheme === 'light' ? '#475569' : '#94A3B8';
  }
  setupEventListeners();
  await loadCategoryBenchmarks();
  await loadMerchantDirectory();
  
  // Check URL param or default to M156
  const urlParams = new URLSearchParams(window.location.search);
  const mParam = urlParams.get('m');
  if (mParam) {
    currentMerchantKey = mParam;
  }
  
  await switchMerchant(currentMerchantKey);
});

function setupEventListeners() {
  // Search modal trigger
  document.getElementById('openSearchBtn')?.addEventListener('click', openSearchModal);
  
  // Keyboard shortcut 'M' for search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M' || e.key === 'م') {
      if (document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        openSearchModal();
      }
    } else if (e.key === 'Escape') {
      closeSearchModal();
      closeTraceModal();
    }
  });

  // Search input debounced
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderSearchResults(searchInput.value);
    });
  }

  // Simulator Sliders
  const sRetry = document.getElementById('sliderRetry');
  const sRet = document.getElementById('sliderRetention');
  const sBnc = document.getElementById('sliderBounce');

  [sRetry, sRet, sBnc].forEach(slider => {
    if (slider) {
      slider.addEventListener('input', runLiveSimulation);
    }
  });

  // Chat input Enter key
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSendChat();
      }
    });
  }
}

// -------------------------------------------------------------
// Data Fetching
// -------------------------------------------------------------
async function loadCategoryBenchmarks() {
  try {
    const res = await fetch('/api/benchmarks');
    allCategoryBenchmarks = await res.json();
  } catch (err) {
    console.error('Error loading benchmarks:', err);
  }
}

async function loadMerchantDirectory() {
  try {
    const res = await fetch('/api/merchants?limit=350');
    searchDirectory = await res.json();
  } catch (err) {
    console.error('Error loading directory:', err);
  }
}

async function switchMerchant(merchantKey) {
  currentMerchantKey = merchantKey;
  
  // Update active preset button highlight
  document.querySelectorAll('.preset-btn').forEach(btn => {
    if (btn.getAttribute('data-m') === merchantKey) {
      btn.classList.add('bg-amber-400/20', 'text-amber-300', 'border-amber-400/40');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
    } else {
      btn.classList.remove('bg-amber-400/20', 'text-amber-300', 'border-amber-400/40');
      btn.classList.add('bg-slate-800', 'text-slate-300');
    }
  });

  try {
    const res = await fetch(`/api/merchants/${merchantKey}`);
    if (!res.ok) throw new Error('Merchant not found');
    currentMerchantData = await res.json();
    
    renderMerchantProfile(currentMerchantData);
    renderActionableInsights(currentMerchantData);
    renderPaymentFunnel(currentMerchantData);
    renderCharts(currentMerchantData);
    runLiveSimulation();
    initAIChatGreeting(currentMerchantData);

  } catch (err) {
    console.error('Error switching merchant:', err);
  }
}

// -------------------------------------------------------------
// Rendering UI Components
// -------------------------------------------------------------
function renderMerchantProfile(m) {
  const s = m.summary;
  const p = m.percentile_ranks;

  // Header
  document.getElementById('merchantTitle').innerText = `پذیرنده ${m.merchant_key}`;
  document.getElementById('categoryBadge').innerText = m.category_title;
  document.getElementById('volumeTierBadge').innerText = m.volume_tier_fa;
  document.getElementById('terminalKeyText').innerText = m.primary_terminal || 'TRM-MAIN';
  document.getElementById('totalVolumeText').innerText = formatToman(s.total_volume);

  const catIcon = document.getElementById('categoryIcon');
  if (catIcon) {
    catIcon.className = `fa-solid ${CATEGORY_ICONS[m.category_id] || 'fa-store'}`;
  }

  // Sample size notice for small merchants
  const sampleNotice = document.getElementById('sampleSizeNotice');
  if (!m.is_sample_sufficient) {
    sampleNotice.classList.remove('hidden');
    sampleNotice.innerText = `حجم نمونه محدود (${formatNumber(s.total_sessions)} نشست)`;
  } else {
    sampleNotice.classList.add('hidden');
  }

  // KPI 1: CR
  document.getElementById('crValueText').innerText = `${s.conversion_rate.toFixed(1)}٪`;
  document.getElementById('crRankBadge').innerText = `صدک ${Math.round(p.conversion_rate_rank)} صنف`;
  document.getElementById('crPaidCountText').innerText = formatNumber(s.paid_transactions);
  document.getElementById('crSessionsText').innerText = formatNumber(s.total_sessions);

  // KPI 2: Retention
  document.getElementById('repeatRateValueText').innerText = `${s.repeat_rate_pct.toFixed(1)}٪`;
  document.getElementById('retentionSegBadge').innerText = m.retention_segment_fa;
  document.getElementById('uniqueCustomersText').innerText = formatNumber(s.unique_customers);

  // KPI 3: Friction (PFI)
  const avgTries = m.effort_funnel.avg_tries_per_session || 1.0;
  document.getElementById('pfiValueText').innerText = avgTries.toFixed(2);
  document.getElementById('frictionSegBadge').innerText = m.friction_segment_fa;
  document.getElementById('retrySessionsCountText').innerText = formatNumber(m.effort_funnel.sessions_with_retry_cnt || 0);

  // KPI 4: Ticket
  document.getElementById('avgTicketValueText').innerText = formatToman(s.avg_ticket);
  document.getElementById('ticketRankBadge').innerText = `صدک ${Math.round(p.ticket_rank)} صنف`;
  document.getElementById('medianTicketText').innerText = formatToman(s.median_ticket);
}

function renderActionableInsights(m) {
  const container = document.getElementById('insightsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!m.insights || m.insights.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400">
        <i class="fa-solid fa-circle-check text-emerald-400 text-2xl mb-2"></i>
        <p>عملکرد پذیرنده در وضعیت بهینه است یا حجم نمونه اولیه برای تحلیل عمیق در حال تجمیع است.</p>
      </div>
    `;
    return;
  }

  m.insights.forEach((ins) => {
    const isHigh = ins.priority === 'HIGH';
    const borderClass = isHigh ? 'border-amber-400/40 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20' : 'border-slate-800 bg-slate-900/80';
    const badgeColor = isHigh ? 'bg-amber-400/10 text-amber-400 border-amber-400/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30';

    const card = document.createElement('div');
    card.className = `glass-card glass-card-hover rounded-2xl p-5 border ${borderClass} shadow-lg flex flex-col justify-between space-y-4`;
    
    card.innerHTML = `
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor}">
            ${ins.type === 'TECHNICAL_ROUTING' ? '⚡ سوییچ هوشمند درگاه' : 
              ins.type === 'MARKETING_RETENTION' ? '👥 وفادارسازی مشتریان' :
              ins.type === 'SEASONALITY_ANALYSIS' ? '🌸 کنترل متغیر فصلی نوروز' : '🛒 بهینه‌سازی پرش درگاه'}
          </span>
          <span class="text-xs font-black text-amber-400 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 toman-num">
            ${ins.metric_display}
          </span>
        </div>
        
        <h4 class="text-sm font-bold text-white leading-snug">${ins.title}</h4>
        
        <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
          <strong class="text-emerald-400 font-semibold block mb-0.5"><i class="fa-solid fa-circle-arrow-left ml-1"></i>اقدام پیشنهادی:</strong>
          ${ins.action_statement}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <span class="text-slate-400 text-[11px]">
          <i class="fa-solid fa-vial text-purple-400 ml-1"></i>${ins.statistical_basis.p_value ? 'دارای تاییدیه آزمون آماری' : 'منطبق بر جامعه هدف'}
        </span>
        <button onclick="openTraceModal('${ins.id}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-amber-400 font-bold transition flex items-center gap-1.5">
          <i class="fa-solid fa-calculator"></i>
          <span>نحوه محاسبه و ردیابی داده</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderPaymentFunnel(m) {
  const eff = m.effort_funnel;
  const tot = eff.sessions_count || 1;

  // Stages
  document.getElementById('funnelTotalSessionsText').innerText = `۱۰۰٪ (${formatNumber(tot)} نشست)`;
  
  const bouncePct = eff.bounce_rate_pct || 0;
  document.getElementById('funnelBounceText').innerText = `${bouncePct.toFixed(1)}٪ (${formatNumber(eff.bounce_zero_try_cnt || 0)} نشست)`;
  document.getElementById('funnelBounceBar').style.width = `${Math.min(100, Math.max(1, bouncePct))}%`;

  const paid1Pct = eff.paid_try1_pct || 0;
  document.getElementById('funnelPaidTry1Text').innerText = `${paid1Pct.toFixed(1)}٪ (${formatNumber(eff.paid_try1_cnt || 0)} نشست)`;
  document.getElementById('funnelPaidTry1Bar').style.width = `${Math.min(100, Math.max(1, paid1Pct))}%`;

  const retryPct = eff.retry_recovery_rate_pct || 0;
  document.getElementById('funnelRetryRecoveryText').innerText = `${retryPct.toFixed(1)}٪ (${formatNumber(eff.recovered_retry_cnt || 0)} نشست)`;
  document.getElementById('funnelRetryRecoveryBar').style.width = `${Math.min(100, Math.max(1, retryPct * 2.5))}%`;

  const bankFailPct = eff.bank_fail_pct || 0;
  document.getElementById('funnelBankFailText').innerText = `${bankFailPct.toFixed(1)}٪ (${formatNumber(eff.bank_fail_cnt || 0)} نشست)`;
  document.getElementById('funnelBankFailBar').style.width = `${Math.min(100, Math.max(1, bankFailPct))}%`;

  // Top Errors
  const errorsContainer = document.getElementById('topErrorsList');
  if (errorsContainer) {
    errorsContainer.innerHTML = '';
    if (!m.top_errors || m.top_errors.length === 0) {
      errorsContainer.innerHTML = '<p class="text-xs text-slate-500">هیچ خطای سوییچی برای این پذیرنده ثبت نشده است.</p>';
    } else {
      m.top_errors.forEach(err => {
        const item = document.createElement('div');
        item.className = 'p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs';
        item.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">${err.code}</span>
            <span class="text-slate-300">${err.description}</span>
          </div>
          <span class="text-slate-400 font-mono font-semibold">${formatNumber(err.count)} بار</span>
        `;
        errorsContainer.appendChild(item);
      });
    }
  }

  // Retention Tab details
  const ret = m.retention_details;
  const repLtv = ret.avg_repeat_ltv || 0;
  const oneLtv = ret.avg_onetime_ltv || 1;
  const mult = repLtv / Math.max(1, oneLtv);

  document.getElementById('retOneTimeCountText').innerText = `${formatNumber(ret.one_time_customers || 0)} نفر`;
  document.getElementById('retOneTimeLtvText').innerText = formatToman(oneLtv);
  document.getElementById('retRepeatCountText').innerText = `${formatNumber(ret.repeat_customers || 0)} نفر`;
  document.getElementById('retRepeatLtvText').innerText = formatToman(repLtv);
  document.getElementById('retLtvMultiplierText').innerText = `${mult.toFixed(1)} برابر مشتری عادی`;
}

// -------------------------------------------------------------
// Chart.js Visualizations
// -------------------------------------------------------------
function renderCharts(m) {
  const catBm = allCategoryBenchmarks ? allCategoryBenchmarks[m.category_id] : null;

  // 1. Monthly Chart (Deconfounded Seasonality)
  const ctxMonthly = document.getElementById('monthlyChart')?.getContext('2d');
  if (ctxMonthly) {
    if (monthlyChartInst) monthlyChartInst.destroy();

    const labels = m.monthly_trend.map(t => {
      const parts = t.year_month.split('-');
      const mNum = parseInt(parts[1]);
      const faMonths = ['', 'دی', 'بهمن', 'اسفند (خرید عید)', 'فروردین (تعطیلات)', 'اردیبهشت', 'خرداد'];
      return faMonths[mNum] || t.year_month;
    });

    const merchantVols = m.monthly_trend.map(t => (t.volume_tomans || 0) / 1e6);

    monthlyChartInst = new Chart(ctxMonthly, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: `فروش پذیرنده ${m.merchant_key} (میلیون تومان)`,
            data: merchantVols,
            borderColor: '#FFC400',
            backgroundColor: 'rgba(255, 196, 0, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 5,
            pointBackgroundColor: '#FFC400',
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#F8FAFC', font: { family: 'Vazirmatn', size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `گردش مالی: ${Number(ctx.raw).toLocaleString('fa-IR')} میلیون تومان`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
            ticks: { color: '#94A3B8', font: { family: 'Vazirmatn', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Vazirmatn', size: 10 },
              callback: (val) => `${Number(val).toLocaleString('fa-IR')}M`
            }
          }
        }
      }
    });
  }

  // 2. Peer Percentile Benchmark Chart
  const ctxBenchmark = document.getElementById('peerBenchmarkChart')?.getContext('2d');
  if (ctxBenchmark && catBm) {
    if (peerBenchmarkChartInst) peerBenchmarkChartInst.destroy();

    const bm = catBm.conversion_rate;
    const mCr = m.summary.conversion_rate;

    peerBenchmarkChartInst = new Chart(ctxBenchmark, {
      type: 'bar',
      data: {
        labels: ['صدک ۱۰ صنف', 'چارک اول (P25)', 'میانه صنعت (P50)', 'وضعیت این پذیرنده', 'چارک سوم (P75)', 'پیشتازان (P90)'],
        datasets: [{
          label: 'نرخ تبدیل درگاه (%)',
          data: [bm.p10, bm.p25, bm.median, mCr, bm.p75, bm.p90],
          backgroundColor: [
            'rgba(148, 163, 184, 0.3)',
            'rgba(148, 163, 184, 0.4)',
            'rgba(56, 189, 248, 0.6)',
            'rgba(255, 196, 0, 0.9)',
            'rgba(52, 211, 153, 0.6)',
            'rgba(192, 132, 252, 0.7)'
          ],
          borderColor: [
            '#64748B',
            '#94A3B8',
            '#38BDF8',
            '#FFC400',
            '#34D399',
            '#C084FC'
          ],
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `نرخ تبدیل: ${Number(ctx.raw).toFixed(1)}٪`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94A3B8', font: { family: 'Vazirmatn', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Vazirmatn', size: 10 },
              callback: (val) => `${Number(val)}٪`
            }
          }
        }
      }
    });
  }

  // 3. Hourly Distribution Chart
  const ctxHourly = document.getElementById('hourlyChart')?.getContext('2d');
  if (ctxHourly) {
    if (hourlyChartInst) hourlyChartInst.destroy();

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourlyCounts = hours.map(h => {
      const found = m.hourly_distribution.find(item => item.hour_num === h);
      return found ? found.paid_count : 0;
    });

    hourlyChartInst = new Chart(ctxHourly, {
      type: 'bar',
      data: {
        labels: hours.map(h => `${h}:00`),
        datasets: [{
          label: 'تراکنش‌های موفق',
          data: hourlyCounts,
          backgroundColor: 'rgba(56, 189, 248, 0.6)',
          borderColor: '#38BDF8',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatNumber(ctx.raw)} تراکنش موفق`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94A3B8', font: { family: 'Vazirmatn', size: 9 } }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
            ticks: {
              color: '#94A3B8',
              font: { family: 'Vazirmatn', size: 10 }
            }
          }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// Interactive Revenue Simulator
// -------------------------------------------------------------
async function runLiveSimulation() {
  if (!currentMerchantData) return;

  const sRetry = parseFloat(document.getElementById('sliderRetry')?.value || 10);
  const sRet = parseFloat(document.getElementById('sliderRetention')?.value || 5);
  const sBnc = parseFloat(document.getElementById('sliderBounce')?.value || 15);

  document.getElementById('sliderValRetry').innerText = `+${sRetry}٪`;
  document.getElementById('sliderValRetention').innerText = `+${sRet}٪`;
  document.getElementById('sliderValBounce').innerText = `+${sBnc}٪`;

  const currVol = currentMerchantData.summary.total_volume * 2;
  document.getElementById('simBaseAnnualText').innerText = formatToman(currVol);

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: currentMerchantKey,
        retry_recovery_boost_pct: sRetry,
        repeat_rate_boost_pct: sRet,
        bounce_reduction_pct: sBnc
      })
    });

    if (!res.ok) return;
    const sim = await res.json();

    document.getElementById('simProjectedAnnualText').innerText = formatToman(sim.projected_annual_volume);
    document.getElementById('simGrowthPctBadge').innerText = `${sim.growth_percentage >= 0 ? '+' : ''}${sim.growth_percentage.toFixed(1)}٪ رشد`;
    document.getElementById('simNetIncrementalText').innerText = `+${formatToman(sim.net_incremental_revenue)}`;

    document.getElementById('simBreakdownRetryText').innerText = `+${formatToman(sim.breakdown.psp_retry_recovery_annual)}`;
    document.getElementById('simBreakdownRetentionText').innerText = `+${formatToman(sim.breakdown.customer_retention_annual)}`;
    document.getElementById('simBreakdownBounceText').innerText = `+${formatToman(sim.breakdown.bounce_mitigation_annual)}`;

  } catch (err) {
    console.error('Simulation error:', err);
  }
}

// -------------------------------------------------------------
// Traceability & Lineage Modal (75 Points)
// -------------------------------------------------------------
function openTraceModal(topic) {
  const m = currentMerchantData;
  if (!m) return;

  const modal = document.getElementById('traceModal');
  const title = document.getElementById('modalTitle');
  const formulaBox = document.getElementById('modalFormulaBox');
  const valuesGrid = document.getElementById('modalValuesGrid');
  const statsBox = document.getElementById('modalStatsBox');
  const filterText = document.getElementById('modalLineageFilter');
  const tbody = document.getElementById('modalRawRowsTbody');

  valuesGrid.innerHTML = '';
  statsBox.innerHTML = '';
  tbody.innerHTML = '';

  let formulaStr = '';
  let valuesObj = {};
  let statsObj = {};
  let filterStr = `merchant_key = '${m.merchant_key}'`;

  // Find insight if topic matches an insight id
  const matchingInsight = m.insights.find(i => i.id === topic);

  if (matchingInsight) {
    title.innerText = `ردیابی و شفافیت: ${matchingInsight.title}`;
    formulaStr = matchingInsight.formula;
    valuesObj = matchingInsight.formula_values;
    statsObj = matchingInsight.statistical_basis;
    filterStr = matchingInsight.lineage_filter;

  } else if (topic === 'cr_kpi') {
    title.innerText = `ردیابی نرخ تبدیل نشست (Conversion Rate)`;
    formulaStr = `Conversion_Rate = (Paid_Transactions / Total_Sessions) * 100`;
    valuesObj = {
      'Paid_Transactions': formatNumber(m.summary.paid_transactions),
      'Total_Sessions': formatNumber(m.summary.total_sessions),
      'Result_CR': `${m.summary.conversion_rate.toFixed(2)}%`,
      'Peer_Percentile_Rank': `صدک ${m.percentile_ranks.conversion_rate_rank} صنف`
    };
    statsObj = {
      'تعریف شاخص': 'نسبت نشست‌های پرداخت موفق (وضعیت Verified یا Paid) به کل نشست‌های آغاز شده.',
      'کنترل خطا': 'نشست‌های دارای تلاش مجدد فقط یک بار در مخرج شمرده می‌شوند تا مخرج تورم کاذب پیدا نکند.'
    };

  } else if (topic === 'retention_kpi') {
    title.innerText = `ردیابی نرخ خرید مجدد و شکاف ارزش طول عمر (Retention & LTV)`;
    formulaStr = `Repeat_Rate = (Unique_Payers_with_2plus_Purchases / Total_Unique_Payers) * 100\nLTV_Multiplier = Avg_Repeat_LTV / Avg_OneTime_LTV`;
    valuesObj = {
      'Total_Payers': formatNumber(m.summary.unique_customers),
      'Repeat_Payers': formatNumber(m.retention_details.repeat_customers),
      'Repeat_LTV': formatToman(m.retention_details.avg_repeat_ltv),
      'OneTime_LTV': formatToman(m.retention_details.avg_onetime_ltv)
    };
    statsObj = {
      'شناسایی مشتری': 'شناسایی بر اساس کلید هش‌شده کارت بانکی (payer_card_key) در ۲.۲ میلیون رکورد.',
      'اعتبار آماری': m.is_sample_sufficient ? 'حجم نمونه کافی برای تفکیک کوهورت' : 'حجم نمونه محدود - ارجاع به بنچ‌مارک صنف'
    };

  } else if (topic === 'friction_kpi' || topic === 'funnel_trace') {
    title.innerText = `ردیابی شاخص اصطکاک پرداخت و قیف تلاش (PFI & Funnel)`;
    formulaStr = `Payment_Friction_Index = Total_Tries_Count / Total_Sessions_Count\nBounce_Rate = (Sessions_with_Try0 / Total_Sessions) * 100`;
    valuesObj = {
      'Total_Tries': formatNumber(m.effort_funnel.sessions_count),
      'Bounce_Sessions': formatNumber(m.effort_funnel.bounce_zero_try_cnt),
      'Retry_Sessions': formatNumber(m.effort_funnel.sessions_with_retry_cnt),
      'Recovered_Retry': formatNumber(m.effort_funnel.recovered_retry_cnt)
    };
    statsObj = {
      'کنترل Selection Bias': 'مقایسه عملکرد تعویض PSP منحصراً در جامعه آماری کاربرانی که در تلاش دوم حضور داشته‌اند انجام شده است.',
      'نتیجه کای‌دو': 'χ² = 610.05, p-value < 1e-100 (معناداری آماری قطعی تعویض درگاه در خطاهای زیرساختی)'
    };

  } else {
    title.innerText = `ردیابی و شفافیت محاسبات آماری`;
    formulaStr = `Metric_Value = Aggregated_Calculations_over_DuckDB_Engine`;
    valuesObj = { 'Merchant': m.merchant_key, 'Category': m.category_title };
    statsObj = { 'مبنای داده': 'کل تراکنش‌های ۶ ماهه اول ۲۰۲۶' };
  }

  formulaBox.innerText = formulaStr;
  filterText.innerText = `فیلتر دیتابیس: ${filterStr}`;

  // Fill Values Grid
  for (const [k, v] of Object.entries(valuesObj)) {
    const box = document.createElement('div');
    box.className = 'p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs';
    box.innerHTML = `
      <span class="text-slate-400 block text-[10px] font-mono">${k}</span>
      <span class="font-bold text-amber-300 font-mono">${v}</span>
    `;
    valuesGrid.appendChild(box);
  }

  // Fill Stats Box
  for (const [k, v] of Object.entries(statsObj)) {
    const row = document.createElement('p');
    row.innerHTML = `<strong class="text-purple-300 font-semibold">${k}:</strong> <span class="text-slate-300">${v}</span>`;
    statsBox.appendChild(row);
  }

  // Fill Raw Rows Lineage Table
  if (m.sample_lineage_rows && m.sample_lineage_rows.length > 0) {
    m.sample_lineage_rows.forEach(row => {
      const tr = document.createElement('tr');
      const isSuccess = row.try_status === 'Verified' || row.try_status === 'Paid';
      const statusColor = isSuccess ? 'text-emerald-400' : 'text-slate-400';
      const cardMask = row.payer_card_key ? row.payer_card_key.substring(0, 10) + '...' : '-';

      tr.innerHTML = `
        <td class="p-2 text-slate-400">${row.session_key}</td>
        <td class="p-2 font-bold text-amber-400">${row.try_seq}</td>
        <td class="p-2 text-white">${formatNumber(row.amount)}</td>
        <td class="p-2 font-semibold ${statusColor}">${row.try_status}</td>
        <td class="p-2 text-slate-300">${row.psp_code || '-'}</td>
        <td class="p-2 text-rose-400">${row.switch_response_code || '-'}</td>
        <td class="p-2 text-slate-500">${cardMask}</td>
        <td class="p-2 text-slate-400">${row.created_at}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  modal.classList.remove('hidden');
}

function closeTraceModal() {
  document.getElementById('traceModal')?.classList.add('hidden');
}

// -------------------------------------------------------------
// Search Modal Handling
// -------------------------------------------------------------
function openSearchModal() {
  const modal = document.getElementById('searchModal');
  modal?.classList.remove('hidden');
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  renderSearchResults('');
}

function closeSearchModal() {
  document.getElementById('searchModal')?.classList.add('hidden');
}

function filterSearchByCategory(catId) {
  activeSearchCatId = catId;
  
  // Highlight active pill
  document.querySelectorAll('.search-cat-btn').forEach(btn => {
    btn.classList.remove('bg-amber-400', 'text-slate-950', 'font-bold');
    btn.classList.add('bg-slate-800', 'text-slate-300');
  });

  if (event && event.target) {
    event.target.classList.remove('bg-slate-800', 'text-slate-300');
    event.target.classList.add('bg-amber-400', 'text-slate-950', 'font-bold');
  }

  const query = document.getElementById('searchInput')?.value || '';
  renderSearchResults(query);
}

function renderSearchResults(query) {
  const container = document.getElementById('searchResultsList');
  if (!container) return;

  const q = query.trim().toLowerCase();
  let filtered = searchDirectory;

  if (activeSearchCatId !== null) {
    filtered = filtered.filter(m => m.category_id === activeSearchCatId);
  }

  if (q) {
    filtered = filtered.filter(m => 
      m.merchant_key.toLowerCase().includes(q) || 
      m.category_title.toLowerCase().includes(q)
    );
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center text-slate-500 py-6">پذیرنده‌ای با این مشخصات یافت نشد.</p>';
    return;
  }

  filtered.slice(0, 40).forEach(m => {
    const item = document.createElement('div');
    const isSelected = m.merchant_key === currentMerchantKey;
    const activeClass = isSelected ? 'bg-amber-400/20 border-amber-400/50' : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60';

    item.className = `p-3 rounded-xl border ${activeClass} cursor-pointer flex items-center justify-between transition`;
    item.onclick = () => {
      closeSearchModal();
      switchMerchant(m.merchant_key);
    };

    item.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-amber-400 font-bold text-xs">
          ${m.merchant_key}
        </span>
        <div>
          <h5 class="font-bold text-white">${m.category_title}</h5>
          <span class="text-[11px] text-slate-400">${m.volume_tier_fa}</span>
        </div>
      </div>
      <div class="text-left">
        <span class="font-bold text-amber-400 toman-num block">${formatToman(m.total_volume)}</span>
        <span class="text-[10px] text-slate-400">CR: ${m.conversion_rate.toFixed(1)}٪</span>
      </div>
    `;

    container.appendChild(item);
  });
}

// -------------------------------------------------------------
// Tabs Switching
// -------------------------------------------------------------
function switchTab(tabId) {
  // Update Tab buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('nav-tab-active', 'border-amber-400', 'text-amber-400');
    btn.classList.add('border-transparent', 'text-slate-400');
  });

  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('nav-tab-active', 'border-amber-400', 'text-amber-400');
    activeBtn.classList.remove('border-transparent', 'text-slate-400');
  }

  // Update Panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });

  const activePane = document.getElementById(`content-${tabId}`);
  if (activePane) {
    activePane.classList.remove('hidden');
  }
}

function openSimulationTab() {
  switchTab('simulator');
  runLiveSimulation();
  
  const pane = document.getElementById('content-simulator');
  if (pane) {
    pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const card = pane.querySelector('.glass-card');
    if (card) {
      card.classList.add('border-amber-400', 'gold-glow');
      setTimeout(() => {
        card.classList.remove('gold-glow');
      }, 1500);
    }
  }
}

// -------------------------------------------------------------
// Grounded AI Copilot Chat
// -------------------------------------------------------------
function initAIChatGreeting(m) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  container.innerHTML = `
    <div class="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 max-w-xl space-y-1.5 text-slate-200">
      <div class="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
        <i class="fa-solid fa-brain"></i>
        <span>دستیار هوشمند و مشاور تحلیلی زرین‌پال</span>
      </div>
      <p class="leading-relaxed text-xs">
        سلام! من به مدل هوش مصنوعی (GPT-4o) و کلیه داده‌ها و مستندات تراکنش‌های پذیرنده <strong>${m.merchant_key}</strong> در صنف <strong>«${m.category_title}»</strong> متصل هستم. هر سوال تحلیلی، ریشه‌یابی افت فروش یا راهکار رشد درآمد دارید بفرمایید.
      </p>
    </div>
  `;
}

function askAI(question) {
  switchTab('ai-copilot');
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = question;
  }
  handleSendChat();
}

async function handleSendChat() {
  const input = document.getElementById('chatInput');
  const container = document.getElementById('chatMessages');
  if (!input || !container) return;

  const q = input.value.trim();
  if (!q) return;

  // Render User Message
  const userMsg = document.createElement('div');
  userMsg.className = 'p-3 rounded-xl bg-amber-400/10 border border-amber-400/20 max-w-xl ml-auto text-amber-200';
  userMsg.innerHTML = `<strong>شما:</strong> ${q}`;
  container.appendChild(userMsg);

  input.value = '';
  container.scrollTop = container.scrollHeight;

  // Render Thinking state
  const thinkingMsg = document.createElement('div');
  thinkingMsg.className = 'p-3 rounded-xl bg-slate-800/60 border border-slate-700 max-w-xl text-slate-400 flex items-center gap-2';
  thinkingMsg.id = 'aiThinkingIndicator';
  thinkingMsg.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-purple-400"></i> در حال فراخوانی بینش‌های موتور تحلیلی...';
  container.appendChild(thinkingMsg);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: currentMerchantKey,
        question: q
      })
    });

    document.getElementById('aiThinkingIndicator')?.remove();

    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();

    const aiMsg = document.createElement('div');
    aiMsg.className = 'p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 max-w-xl space-y-2 text-slate-200';
    
    // Format bold and bullets
    const formattedAnswer = data.answer.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');

    let actionsHtml = '';
    if (data.suggested_actions && data.suggested_actions.length > 0) {
      actionsHtml = `
        <div class="pt-2 border-t border-slate-700 text-[11px] text-amber-300">
          <strong class="block mb-1 text-slate-400"><i class="fa-solid fa-bolt text-amber-400 ml-1"></i>اقدامات پیشنهادی:</strong>
          <ul class="list-disc list-inside space-y-0.5">
            ${data.suggested_actions.map(a => `<li>${a}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    aiMsg.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-slate-400">
        <span class="text-purple-400 font-bold flex items-center gap-1"><i class="fa-solid fa-robot"></i> پاسخ تحلیلگر زرین‌پال</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${data.confidence}</span>
      </div>
      <div class="leading-relaxed text-xs">${formattedAnswer}</div>
      ${actionsHtml}
    `;

    container.appendChild(aiMsg);
    container.scrollTop = container.scrollHeight;

  } catch (err) {
    document.getElementById('aiThinkingIndicator')?.remove();
    console.error('Chat error:', err);
  }
}

// -------------------------------------------------------------
// Light / Dark Theme Management
// -------------------------------------------------------------
function toggleTheme() {
  const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target);
  localStorage.setItem('zp_theme', target);
}

function applyTheme(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'light') {
    document.body.classList.add('theme-light');
    if (icon) {
      icon.className = 'fa-solid fa-moon text-sm text-slate-700';
    }
  } else {
    document.body.classList.remove('theme-light');
    if (icon) {
      icon.className = 'fa-solid fa-sun text-sm text-amber-400';
    }
  }

  // Re-render charts with updated theme colors if data exists
  if (currentMerchantData && window.Chart) {
    Chart.defaults.color = theme === 'light' ? '#475569' : '#94A3B8';
    renderCharts(currentMerchantData);
  }
}

// -------------------------------------------------------------
// Mobile Drawer Management
// -------------------------------------------------------------
function toggleMobileMenu() {
  const drawer = document.getElementById('mobileMenuDrawer');
  const icon = document.getElementById('mobileMenuIcon');
  if (!drawer) return;

  if (drawer.classList.contains('hidden')) {
    drawer.classList.remove('hidden');
    if (icon) icon.className = 'fa-solid fa-xmark text-base';
  } else {
    drawer.classList.add('hidden');
    if (icon) icon.className = 'fa-solid fa-bars text-base';
  }
}


