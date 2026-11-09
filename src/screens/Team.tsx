import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { BackButton, Body, Button, Card, Chevron, Chip, Field, IconTile, Label, Notice, Title } from '../components/ui';
import { PersonIcon, PlusIcon } from '../components/icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { addTeamMember, FriendlyError, newTeamCode, NotConfiguredError, removeTeamMember, teamMembers, updateTeamMember } from '../lib/api';
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

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
      <Header title="Mon équipe" />
      <Body soft>Vos employés préparent les posts. Un patron les valide avant qu'ils partent sur Instagram et Facebook.</Body>

      {error && <Notice tone="red" title="L'équipe n'a pas pu être chargée" text={error} />}
      {error && <Button title="Réessayer" kind="secondary" onPress={reload} />}
      {!list && !error && <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />}

      {list && (
        <>
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
                  sub={shopsLabel(m.shopIds, shops)}
                  onPress={() => go({ name: 'teamMember', id: m.id })}
                  right={(
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <Switch
                        value={m.canPublish}
                        disabled={saving === m.id}
                        onValueChange={(v) => toggle(m, v)}
                        trackColor={{ true: colors.green, false: '#D6DBD5' }}
                        thumbColor="#fff"
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
        </>
      )}
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

      {freshCode && <Notice tone="green" title={`${m.firstName} fait partie de l'équipe`} text="Donnez-lui son code. Il ouvre Vitrine, touche « J'ai déjà un compte », puis tape son e-mail et ce code." />}

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
