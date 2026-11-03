// POST { month: "2026-11", count, previous_count, in_progress, days_left, occasions?: [{ name, date }], trade_hint? }
//   -> { advice }
// « Mon bilan » : un conseil simple pour le mois suivant, écrit par l'IA.
// Les chiffres sont ceux de l'app (vrais posts publiés) ; l'IA n'a pas le droit d'en inventer.
import { handler, HttpError, json } from '../_shared/http.ts';
import { rateLimit, requireMerchant } from '../_shared/db.ts';
import { writeAdvice } from '../_shared/openai.ts';
import { REPORT_PROMPT_VERSION } from '../_shared/report.ts';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

Deno.serve(handler(async (req) => {
  const { db, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));

  const month = String(body.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'bad_month', 'Mois invalide.');
  const count = int(body.count, 500);
  const previousCount = int(body.previous_count, 500);
  const inProgress = body.in_progress === true;
  const daysLeft = inProgress ? int(body.days_left, 31) : 0;

  // Même mois, mêmes chiffres : on redonne le conseil déjà écrit (pas de nouvel appel à l'IA).
  const { data: cached } = await db.from('monthly_reports').select('advice')
    .eq('business_id', business.id).eq('month', month).eq('posts_count', count).eq('previous_count', previousCount)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (cached?.advice) return json({ advice: cached.advice });

  // Limitation des coûts : 10 conseils par heure et par boutique.
  await rateLimit(db, 'monthly_reports', business.id, 10, 60);

  const occasions = (Array.isArray(body.occasions) ? body.occasions : []).slice(0, 4).map((o: Record<string, unknown>) => ({
    name: String(o.name ?? '').slice(0, 60),
    date: String(o.date ?? '').slice(0, 10),
  })).filter((o: { name: string; date: string }) => o.name && /^\d{4}-\d{2}-\d{2}$/.test(o.date));

  const [y, m] = month.split('-').map(Number);
  const advice = await writeAdvice({
    businessName: business.business_name,
    trade: business.trade || business.business_type,
    city: business.city,
    tone: business.tone,
    products: business.specialties,
    tradeHint: String(body.trade_hint ?? '').slice(0, 300) || null,
    monthLabel: `${MONTHS[m - 1]} ${y}`,
    previousMonthName: MONTHS[(m + 10) % 12],
    count,
    previousCount,
    inProgress,
    daysLeft,
    occasions,
  });

  await db.from('monthly_reports').insert({ business_id: business.id, month, posts_count: count, previous_count: previousCount, advice, prompt_version: REPORT_PROMPT_VERSION });
  return json({ advice });
}));
