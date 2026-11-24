import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { BackButton, Body, Button, Card, Chevron, Chip, Field, IconTile, Label, Notice, Title } from '../components/ui';
import { PersonIcon, PlusIcon } from '../components/icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { addTeamMember, FriendlyError, newTeamCode, NotConfiguredError, removeTeamMember, setTeamGoal, setTeamNote, stopTeamGoal, teamMembers, updateTeamMember } from '../lib/api';
import { Bar } from '../components/PointsScene';
import { frNumber, GOAL_CHOICES, levelOf, MAX_SENT_PER_DAY, POINTS, postsLeft } from '../lib/points';
import { shopsLabel, type TeamList, type TeamMember } from '../lib/team';
import type { Business } from '../lib/types';

const errorText = (e: unknown) =>
  e instanceof NotConfiguredError ? "L'équipe n'est pas encore activée sur le serveur." : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.';

/** L'équipe, relue sur le serveur à chaque ouverture de l'écran. */
function useTeamList() {
  const [list, setList] = useState<TeamList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setError(null);
    try { setList(await teamMembers()); } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { list, error, reload, setList };
}

function Header({ title }: { title: string }) {
  const { back } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={back} />
      <Title size={26} style={{ flex: 1 }}>{title}</Title>
    </View>
  );
}

/** Une ligne de la liste : avatar, prénom, sous-titre, et à droite un interrupteur ou une flèche. */
function PersonRow({ name, sub, right, onPress, first }: { name: string; sub: string; right?: React.ReactNode; onPress?: () => void; first?: boolean }) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(36,51,43,0.08)' }}>
      <IconTile size={44}><PersonIcon size={22} color={colors.green} /></IconTile>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '700' }}>{name}</Body>
        <Body soft size={14}>{sub}</Body>
      </View>
      {right ?? (onPress ? <Chevron /> : null)}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${sub}`}>{content}</Pressable> : content;
}

/** Réglages › Mon équipe : les patrons, les employés (avec « Publie seul »), et le bouton pour ajouter. */
export function Team() {
  const { go, team, refreshTeam } = useApp();
  const shops = team?.shops ?? [];
  const { list, error, reload, setList } = useTeamList();
  const [saving, setSaving] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // En quittant l'équipe, l'accueil se remet à jour (nombre de personnes, posts à valider).
  useEffect(() => () => { refreshTeam(); }, [refreshTeam]);

  // « Publie seul » : décidé par le patron, ici dans la liste (éteint au départ).
  async function toggle(m: TeamMember, value: boolean) {
    setSaving(m.id);
    setRowError(null);
    setList((l) => (l ? { ...l, members: l.members.map((x) => (x.id === m.id ? { ...x, canPublish: value } : x)) } : l));
    try {
      await updateTeamMember(m.id, { canPublish: value });
    } catch (e) {
      setRowError(errorText(e));
      await reload();
    } finally {
      setSaving(null);
    }
  }

  const patrons = list?.members.filter((m) => m.role === 'patron') ?? [];
  const employees = list?.members.filter((m) => m.role === 'employe') ?? [];
  // Points installés sur le serveur ? (sinon, on n'affiche ni objectif ni récap)
  const withPoints = Boolean(team?.points) && employees.some((m) => m.stats);
  const month = employees.reduce((a, m) => ({ prepared: a.prepared + (m.stats?.prepared ?? 0), published: a.published + (m.stats?.published ?? 0) }), { prepared: 0, published: 0 });
  // Temps gagné : environ 20 minutes par post publié (photo, texte, publication), à la louche et dit comme tel.
  const minutes = month.published * 20;
  const goal = team?.points?.goal ?? null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
      <Header title="Mon équipe" />
      <Body soft>Vos employés préparent les posts. Un patron les valide avant qu'ils partent sur Instagram et Facebook.</Body>

      {error && <Notice tone="red" title="L'équipe n'a pas pu être chargée" text={error} />}
      {error && <Button title="Réessayer" kind="secondary" onPress={reload} />}
      {!list && !error && <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />}

      {list && (
        <>
          {withPoints && (
            <>
              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.textSoft, fontWeight: '700', fontSize: 12, letterSpacing: 1, fontFamily: fonts.body }}>{new Date().toLocaleDateString('fr-FR', { month: 'long' }).toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Stat value={String(month.prepared)} label={month.prepared > 1 ? 'posts préparés' : 'post préparé'} />
                  <Stat value={String(month.published)} label={month.published > 1 ? 'publiés' : 'publié'} />
                  <Stat value={minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`} label="gagnées (environ)" orange />
                </View>
              </Card>

              <Card onPress={() => go({ name: 'teamGoal' })} style={{ gap: 8, backgroundColor: 'rgba(253,243,226,0.9)', borderColor: 'rgba(242,182,109,0.6)', borderWidth: 1.5 }}>
                <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 12, letterSpacing: 1, fontFamily: fonts.body }}>OBJECTIF DE L'ÉQUIPE</Text>
                {goal ? (
                  <>
                    <Body style={{ fontWeight: '700' }}>{goal.reachedAt ? `Atteint : ${goal.reward}` : `${frNumber(goal.points)} points : ${goal.reward}`}</Body>
                    <Bar value={goal.progress / goal.points} />
                    <Body soft size={14}>{goal.reachedAt ? 'Bravo à toute l\'équipe. Touchez pour en fixer un nouveau.' : `${frNumber(goal.progress)} / ${frNumber(goal.points)} · encore environ ${postsLeft(goal.points, goal.progress)} posts publiés`}</Body>
                  </>
                ) : (
                  <Body soft size={15}>Une récompense pour toute l'équipe quand elle atteint un nombre de points. Touchez pour en fixer un.</Body>
                )}
              </Card>

              <NoteBox initial={team?.note?.text ?? ''} onSaved={refreshTeam} />
            </>
          )}

          <Label>Patrons</Label>
          <Card style={{ paddingVertical: 4 }}>
            <PersonRow first name={list.owner.isMe ? `${list.owner.firstName} (vous)` : list.owner.firstName} sub="Paie l'abonnement" />
            {patrons.map((m) => (
              <PersonRow key={m.id} name={m.isMe ? `${m.firstName} (vous)` : m.firstName} sub="Toutes les boutiques" onPress={() => go({ name: 'teamMember', id: m.id })} />
            ))}
          </Card>

          <Label>Employés</Label>
          {employees.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {employees.map((m, i) => (
                <PersonRow
                  key={m.id}
                  first={i === 0}
                  name={m.firstName}
                  sub={m.stats && withPoints
                    ? `Niveau ${levelOf(m.stats.totalPoints).number} · ${m.stats.prepared} préparé${m.stats.prepared > 1 ? 's' : ''} · ${m.stats.published} publié${m.stats.published > 1 ? 's' : ''} ce mois · ${frNumber(m.stats.totalPoints)} pts${shops.length > 1 ? ` · ${shopsLabel(m.shopIds, shops)}` : ''}`
                    : shopsLabel(m.shopIds, shops)}
                  onPress={() => go({ name: 'teamMember', id: m.id })}
                  right={(
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <Switch
                        value={m.canPublish}
                        disabled={saving === m.id}
                        onValueChange={(v) => toggle(m, v)}
                        trackColor={{ true: colors.green, false: '#C9D1CB' }}
                        thumbColor="#fff"
                        {...({ activeThumbColor: '#fff' } as object)}
                        accessibilityLabel={`${m.firstName} publie seul, sans attendre votre accord`}
                      />
                      <Text style={{ color: colors.textSoft, fontSize: 12, fontFamily: fonts.body }}>Publie seul</Text>
                    </View>
                  )}
                />
              ))}
            </Card>
          ) : (
            <Card><Body soft>Pas encore d'employé. Ajoutez-en un : il préparera les posts depuis son téléphone, et vous les validerez.</Body></Card>
          )}
          {rowError && <Notice tone="red" title={rowError} />}
          {employees.some((m) => m.canPublish) && <Body soft size={14}>« Publie seul » : cet employé publie sans attendre votre accord. Vous pouvez l'éteindre à tout moment.</Body>}

          <Button title="Ajouter un employé" icon={<PlusIcon size={22} color={colors.white} />} onPress={() => go({ name: 'teamAdd' })} style={{ minHeight: 60 }} />
          <View style={{ height: 4 }} />
          <Body soft size={14} center>Les employés sont gratuits, autant qu'il en faut.</Body>
          {withPoints && <Body soft size={14} center>Vos employés voient leurs propres points et la barre de l'équipe, jamais ceux des collègues. Ils savent que vous voyez ce détail.</Body>}
        </>
      )}
    </ScrollView>
  );
}

function Stat({ value, label, orange }: { value: string; label: string; orange?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: fonts.title, fontSize: 26, fontWeight: '600', color: orange ? colors.orangeText : colors.text }}>{value}</Text>
      <Body soft size={14}>{label}</Body>
    </View>
  );
}

/** Le petit mot du patron, affiché en haut de l'accueil de ses employés. */
function NoteBox({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [note, setNote] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await setTeamNote(note.trim());
      setMsg({ ok: true, text: note.trim() ? 'Vos employés le verront sur leur accueil.' : 'Message retiré.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 10 }}>
      <Field label="Un mot pour l'équipe (facultatif)" value={note} onChangeText={setNote} maxLength={160} placeholder="Ex. : Cette semaine, nos couronnes de Noël, de près." />
      {msg && <Notice tone={msg.ok ? 'green' : 'red'} title={msg.text} />}
      <Button title="Enregistrer le message" kind="secondary" loading={busy} disabled={note.trim() === initial.trim()} onPress={save} />
    </Card>
  );
}

/** Fixer l'objectif de l'équipe : les points, la récompense. Pour toute l'équipe, sans date (décisions de Kelian). */
export function TeamGoalScreen() {
  const { back, team, refreshTeam } = useApp();
  const current = team?.points?.goal ?? null;
  const open = current && !current.reachedAt ? current : null;
  const [points, setPoints] = useState<number>(open?.points ?? 1000);
  const [reward, setReward] = useState(open?.reward ?? '');
  const [busy, setBusy] = useState<'save' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy('save');
    setError(null);
    try {
      await setTeamGoal(points, reward.trim());
      await refreshTeam();
      back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function stop() {
    setBusy('stop');
    setError(null);
    try {
      await stopTeamGoal();
      await refreshTeam();
      back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Header title={open ? "Changer l'objectif" : 'Fixer un objectif'} />
      <Body soft>Une récompense pour toute l'équipe quand elle atteint un nombre de points. Pas de date limite, pas de classement : tout le monde avance ensemble. C'est vous qui choisissez la récompense, Vitrine ne gère pas d'argent.</Body>

      <Body style={{ fontWeight: '700' }}>Combien de points ?</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {GOAL_CHOICES.map((n) => <Chip key={n} label={frNumber(n)} selected={points === n} onPress={() => setPoints(n)} />)}
      </View>
      <Body soft size={14}>{`Environ ${postsLeft(points, 0)} posts publiés.`}</Body>

      <Field label="La récompense" value={reward} onChangeText={setReward} maxLength={80} placeholder="Ex. : Un resto offert" />

      <Card style={{ gap: 6 }}>
        <Text style={{ color: colors.textSoft, fontWeight: '700', fontSize: 12, letterSpacing: 1, fontFamily: fonts.body }}>COMMENT ON GAGNE DES POINTS</Text>
        <Body size={15}>{`Envoyer un post : +${POINTS.sent} (${MAX_SENT_PER_DAY} par jour au plus)`}</Body>
        <Body size={15}>{`Post publié : +${POINTS.published}`}</Body>
        <Body size={15}>Post refusé : 0</Body>
      </Card>

      {open && <Body soft size={14}>{`Le nouvel objectif repart de zéro (l'équipe en est à ${frNumber(open.progress)} points).`}</Body>}
      {error && <Notice tone="red" title={error} />}
      <Button title="Enregistrer l'objectif" loading={busy === 'save'} disabled={!reward.trim()} onPress={save} style={{ minHeight: 60 }} />
      {current && <Button title="Arrêter l'objectif" kind="ghost" loading={busy === 'stop'} onPress={stop} />}
    </ScrollView>
  );
}

/** Choix des boutiques d'un employé (« Toutes », ou une par une). Liste vide = toutes. */
function ShopChips({ shops, value, onChange }: { shops: Business[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = !value.length;
  const toggle = (id: string) => {
    const base = all ? [] : value;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(next.length >= shops.length ? [] : next);
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="Toutes" selected={all} onPress={() => onChange([])} />
      {shops.map((s) => <Chip key={s.id} label={s.city || s.businessName} selected={!all && value.includes(s.id!)} onPress={() => toggle(s.id!)} />)}
    </View>
  );
}

const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

/** Ajouter un employé : prénom, e-mail, boutiques. Le rôle « employé » est mis tout seul ; un petit lien pour un patron. */
export function TeamAdd({ initialRole = 'employe' }: { initialRole?: 'patron' | 'employe' }) {
  const { back, go, team } = useApp();
  const shops = team?.shops ?? [];
  const [role, setRole] = useState<'patron' | 'employe'>(initialRole);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patron = role === 'patron';

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id, code } = await addTeamMember({ firstName: firstName.trim(), email: email.trim(), role, shopIds });
      back();
      go({ name: 'teamMember', id, code });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Header title={patron ? 'Ajouter un patron' : 'Ajouter un employé'} />
      {patron && <Notice tone="orange" title="Un patron a les mêmes droits que vous" text="Il valide et publie les posts, gère l'équipe, les boutiques et l'abonnement." />}
      <Field label="Son prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" placeholder="Ex. : Sophie" />
      <Field label="Son e-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" placeholder="Ex. : sophie@exemple.fr" />
      {!patron && shops.length > 1 && (
        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '600' }}>Ses boutiques</Body>
          <ShopChips shops={shops} value={shopIds} onChange={setShopIds} />
        </View>
      )}
      <Body soft size={15}>Vitrine lui fabrique un code de connexion. Vous le lui donnerez : il se connecte avec son e-mail et ce code.</Body>
      {error && <Notice tone="red" title={error} />}
      <Button title="Ajouter" loading={busy} disabled={!firstName.trim() || !isEmail(email)} onPress={submit} style={{ minHeight: 60 }} />
      <Pressable onPress={() => setRole(patron ? 'employe' : 'patron')} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body, textDecorationLine: 'underline' }}>
          {patron ? 'Ajouter plutôt un employé' : 'Ajouter plutôt un patron'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

/** La fiche d'une personne : son code (au cas où il l'a perdu), ses boutiques, et « Retirer de l'équipe ». */
export function TeamMemberScreen({ id, code: freshCode }: { id: string; code?: string }) {
  const { back, team } = useApp();
  const shops = team?.shops ?? [];
  const { list, error, reload, setList } = useTeamList();
  const m = list?.members.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saved, setSaved] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try { await fn(); } catch (e) { setActionError(errorText(e)); } finally { setBusy(false); }
  }
  const patch = (p: Partial<TeamMember>) => setList((l) => (l ? { ...l, members: l.members.map((x) => (x.id === id ? { ...x, ...p } : x)) } : l));

  if (error) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Header title="Mon équipe" />
        <Notice tone="red" title="La fiche n'a pas pu être chargée" text={error} />
        <Button title="Réessayer" kind="secondary" onPress={reload} />
      </ScrollView>
    );
  }
  if (!list) return <ActivityIndicator color={colors.green} style={{ marginTop: 80 }} />;
  if (!m) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Header title="Mon équipe" />
        <Notice tone="orange" title="Cette personne ne fait plus partie de l'équipe." />
      </ScrollView>
    );
  }
  const code = m.code ?? freshCode ?? null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <IconTile size={56}><PersonIcon size={28} color={colors.green} /></IconTile>
        <View style={{ flex: 1 }}>
          <Title size={26}>{m.firstName}</Title>
          <Body soft size={15}>{m.role === 'patron' ? 'Patron' : 'Employé'} · {m.email}</Body>
        </View>
      </View>

      {freshCode && <Notice tone="green" title={`${m.firstName} fait partie de l'équipe`} text="Donnez-lui son code. Sur son téléphone : ouvrir Vitrine, toucher « J'ai déjà un compte », puis taper son e-mail et ce code." />}

      <Card style={{ gap: 10 }}>
        <Body soft size={14} style={{ fontWeight: '700' }}>Son code de connexion</Body>
        {code ? (
          <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, borderRadius: 16, backgroundColor: 'rgba(220,239,227,0.6)', paddingVertical: 14, alignItems: 'center' }}>
            <Text selectable accessibilityLabel={`Code : ${code.split('').join(' ')}`} style={{ fontFamily: fonts.title, fontSize: 32, fontWeight: '700', letterSpacing: 5, color: colors.greenDark }}>{code}</Text>
          </View>
        ) : (
          <Body soft size={15}>Ce code n'est plus lisible. Faites-en un nouveau.</Body>
        )}
        <Body soft size={14} center>{m.firstName} se connecte avec son e-mail et ce code, à la place du mot de passe.</Body>
        <Button
          title="Faire un nouveau code"
          kind="ghost"
          loading={busy}
          onPress={() => run(async () => { const c = await newTeamCode(m.id); patch({ code: c }); })}
        />
        <Body soft size={13} center>L'ancien code ne marchera plus.</Body>
      </Card>

      {m.role === 'employe' && shops.length > 1 && (
        <View style={{ gap: 8 }}>
          <Body style={{ fontWeight: '600' }}>Ses boutiques</Body>
          <ShopChips
            shops={shops}
            value={m.shopIds}
            onChange={(v) => {
              patch({ shopIds: v });
              setSaved(false);
              run(async () => { await updateTeamMember(m.id, { shopIds: v }); setSaved(true); });
            }}
          />
          {saved && <Body soft size={14}>C'est enregistré.</Body>}
        </View>
      )}

      {actionError && <Notice tone="red" title={actionError} />}

      {!m.isMe && (!confirmRemove ? (
        <Button title="Retirer de l'équipe" kind="danger" onPress={() => setConfirmRemove(true)} />
      ) : (
        <Card style={{ gap: 10 }}>
          <Body>{m.firstName} ne pourra plus se connecter. Les posts déjà préparés restent dans la boutique.</Body>
          <Button title={`Oui, retirer ${m.firstName}`} kind="danger" loading={busy} onPress={() => run(async () => { await removeTeamMember(m.id); back(); })} />
          <Button title="Annuler" kind="ghost" onPress={() => setConfirmRemove(false)} />
        </Card>
      ))}
    </ScrollView>
  );
}
