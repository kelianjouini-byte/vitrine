import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Card, Chip, Field, Title } from '../components/ui';
import { EmailCodeForm } from '../components/AccountForms';
import { NetworkCards } from '../components/NetworkCards';
import { LogoMark } from '../components/icons';
import { GlassBackground } from '../components/GlassBackground';
import { DEFAULT_TONE, TONES } from '../lib/business';
import { TradePicker } from '../components/TradePicker';
import { IdentityFields } from '../components/IdentityFields';
import { matchTrade } from '../lib/trades';
import { occasionCatalog } from '../lib/events';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { detectBusiness, saveBusinessRemote, sendLoginCode, suggestOccasionKeys, verifyLoginCode, FriendlyError } from '../lib/api';
import { isBackendConfigured } from '../lib/config';
import type { Business, Tone } from '../lib/types';

const STEPS = 4;

export function Onboarding() {
  const { saveBusiness, restoreFromServer } = useApp();
  const [restoring, setRestoring] = useState(false);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Business>>({ tone: DEFAULT_TONE });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const set = <K extends keyof Business>(k: K, v: Business[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(false);
  const [foundOnline, setFoundOnline] = useState(false);
  const triedFor = useRef('');

  // Dès que le nom et la ville sont écrits, l'IA cherche la boutique sur internet pour pré-remplir le métier.
  useEffect(() => {
    const name = form.businessName?.trim() ?? '';
    const city = form.city?.trim() ?? '';
    const cp = form.postalCode?.trim() ?? '';
    const key = `${name}|${city}|${cp}`.toLowerCase();
    if (!isBackendConfigured || form.businessType || name.length < 2 || city.length < 2 || triedFor.current === key) return;
    const t = setTimeout(async () => {
      triedFor.current = key;
      setDetecting(true);
      try {
        const found = await detectBusiness({ businessName: name, city, postalCode: cp });
        if (found?.trade) {
          const m = matchTrade(found.trade);
          // On pré-remplit seulement ce que le commerçant n'a pas déjà écrit.
          setForm((f) => (f.businessType ? f : {
            ...f,
            businessType: m?.id ?? 'autre',
            trade: m?.label ?? found.trade!,
            specialties: f.specialties || found.products || undefined,
            strengths: f.strengths || found.strengths || undefined,
            audience: f.audience || found.audience || undefined,
          }));
          setDetected(true);
          setFoundOnline(Boolean(found.products || found.strengths || found.audience));
        }
      } catch {
        /* pas grave : le commerçant choisit son métier lui-même */
      } finally {
        setDetecting(false);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [form.businessName, form.city, form.postalCode, form.businessType]);

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!form.ownerFirstName?.trim()) e.ownerFirstName = 'Indiquez votre prénom.';
    if (!form.businessName?.trim()) e.businessName = 'Indiquez le nom de votre boutique.';
    if (!form.businessType) e.businessType = 'Choisissez ou écrivez votre métier.';
    if (!form.city?.trim()) e.city = 'Indiquez votre ville.';
    if (!/^\d{5}$/.test(form.postalCode?.trim() ?? '')) e.postalCode = 'Le code postal a 5 chiffres.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    const b: Business = {
      ownerFirstName: form.ownerFirstName!.trim(),
      businessName: form.businessName!.trim(),
      businessType: form.businessType!,
      trade: form.trade?.trim() || undefined,
      city: form.city!.trim(),
      postalCode: form.postalCode!.trim(),
      tone: form.tone ?? DEFAULT_TONE,
      audience: form.audience?.trim() || undefined,
      description: form.description?.trim() || undefined,
      specialties: form.specialties?.trim() || undefined,
      strengths: form.strengths?.trim() || undefined,
    };
    try {
      // Métier hors liste : l'IA choisit les occasions qui lui conviennent (sinon, toutes restent proposées).
      if (b.businessType === 'autre' && b.trade) {
        try {
          const keys = await suggestOccasionKeys(b.trade, occasionCatalog());
          if (keys.length) b.occasionKeys = keys;
        } catch {
          /* on garde toutes les occasions */
        }
      }
      b.id = await saveBusinessRemote(b);
      await saveBusiness(b);
    } catch (e) {
      setSaveError(e instanceof FriendlyError ? e.message : 'Un problème est survenu. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <GlassBackground />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? colors.green : 'rgba(36,51,43,0.10)' }} />
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Body soft size={15}>Étape {step} sur {STEPS}</Body>

        {step === 1 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LogoMark size={44} />
              <Title size={26} style={{ color: colors.green }}>Vitrine</Title>
            </View>
            <Title size={30}>Votre boutique</Title>
            <Body soft>Quelques informations pour écrire des posts qui vous ressemblent.</Body>
            {isBackendConfigured && (!restoring ? (
              <Pressable onPress={() => setRestoring(true)} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>J'ai déjà un compte : retrouver ma boutique ›</Text>
              </Pressable>
            ) : (
              <Card style={{ gap: 12 }}>
                <Body style={{ fontWeight: '700' }} size={18}>Retrouver ma boutique</Body>
                <EmailCodeForm
                  intro="Écrivez l'e-mail qui protège votre compte. Vous recevrez un code pour retrouver votre boutique et vos posts."
                  sendLabel="Recevoir mon code"
                  onSend={sendLoginCode}
                  onVerify={async (email, code) => {
                    await verifyLoginCode(email, code);
                    if (!(await restoreFromServer())) throw new FriendlyError("Aucune boutique n'est enregistrée avec ce compte. Créez-la avec le formulaire ci-dessous.");
                  }}
                />
                <Button title="Annuler" kind="ghost" onPress={() => setRestoring(false)} />
              </Card>
            ))}
            <Field label="Votre prénom" value={form.ownerFirstName} onChangeText={(v) => set('ownerFirstName', v)} placeholder="Ex. : Marie" error={errors.ownerFirstName} autoComplete="given-name" />
            <Field label="Nom de la boutique" value={form.businessName} onChangeText={(v) => set('businessName', v)} placeholder="Ex. : Fleurs de Marie" error={errors.businessName} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 2 }}><Field label="Ville" value={form.city} onChangeText={(v) => set('city', v)} placeholder="Ex. : Lyon" error={errors.city} /></View>
              <View style={{ flex: 1.3 }}><Field label="Code postal" value={form.postalCode} onChangeText={(v) => set('postalCode', v.replace(/\D/g, '').slice(0, 5))} placeholder="Ex. : 69002" keyboardType="number-pad" error={errors.postalCode} /></View>
            </View>
            <TradePicker
              value={{ businessType: form.businessType, trade: form.trade }}
              onChange={(v) => { setForm((f) => ({ ...f, businessType: v.businessType, trade: v.trade })); setDetected(false); }}
              detecting={detecting}
              detectedFrom={detected}
              error={errors.businessType}
            />
            <Button title="Continuer" onPress={() => validateStep1() && setStep(2)} />
          </>
        )}

        {step === 2 && (
          <>
            <Title size={30}>Votre style</Title>
            <Body soft>Comment aimez-vous parler à vos clients ?</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TONES.map((t) => (
                <Chip key={t.id} label={t.label} selected={form.tone === t.id} onPress={() => set('tone', t.id as Tone)} />
              ))}
            </View>
            <Title size={22}>Votre carte d'identité</Title>
            <Body soft>Ce que l'IA doit savoir pour écrire comme vous et vous proposer des idées. Tout est modifiable plus tard.</Body>
            <IdentityFields value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} foundOnline={foundOnline} />
            <Button title="Continuer" onPress={() => setStep(3)} />
            <Button title="Retour" kind="ghost" onPress={() => setStep(1)} />
          </>
        )}

        {step === 3 && (
          <>
            <Title size={30}>Vos réseaux</Title>
            <Body soft>Vous serez redirigé vers Facebook pour donner votre accord. Vitrine ne vous demandera jamais votre mot de passe.</Body>
            <NetworkCards />
            <Button title="Continuer" onPress={() => setStep(4)} />
            <Button title="Je le ferai plus tard" kind="ghost" onPress={() => setStep(4)} />
          </>
        )}

        {step === 4 && (
          <View style={{ alignItems: 'center', gap: 18, paddingTop: 40 }}>
            <LogoMark size={110} />
            <Title size={30} style={{ textAlign: 'center' }}>{'Votre boutique est prête\u00a0!'}</Title>
            <Body soft center>Prenez votre première photo, Vitrine s'occupe du reste.</Body>
            {saveError ? <Body style={{ color: colors.red }} center>{saveError}</Body> : null}
            <Button title="Commencer" onPress={finish} loading={saving} style={{ alignSelf: 'stretch', marginTop: 12 }} />
            <Button title="Retour" kind="ghost" onPress={() => setStep(3)} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
