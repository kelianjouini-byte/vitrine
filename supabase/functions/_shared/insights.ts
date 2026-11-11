// Lecture d'une réponse « insights » de Meta. Fichier pur (testé avec node --test).
export type Insights = { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };

/** Valeur d'une métrique dans une réponse « insights » (format « values » ou « total_value »). */
export function metric(res: Insights | null, ...names: string[]): number | null {
  for (const name of names) {
    const m = res?.data?.find((d) => d.name === name);
    const v = m?.total_value?.value ?? m?.values?.[0]?.value;
    if (typeof v === 'number') return v;
  }
  return null;
}

