import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Chip, Field, Title } from '../components/ui';
import { NetworkCards } from '../components/NetworkCards';
import { LogoMark } from '../components/icons';
import { BUSINESS_TYPES, TONES } from '../lib/business';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { saveBusinessRemote, FriendlyError } from '../lib/api';
import type { Business, BusinessType, Tone } from '../lib/types';

const STEPS = 4;

export function Onboarding() {
  const { saveBusiness } = useApp();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Business>>({ tone: 'chaleureux' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const set = <K extends keyof Business>(k: K, v: Business[K]) => setForm((f) => ({ ...f, [k]: v }));

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!form.ownerFirstName?.trim()) e.ownerFirstName = 'Indiquez votre prénom.';
    if (!form.businessName?.trim()) e.businessName = 'Indiquez le nom de votre boutique.';
    if (!form.businessType) e.businessType = 'Choisissez votre type de commerce.';
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
      city: form.city!.trim(),
      postalCode: form.postalCode!.trim(),
      tone: form.tone ?? 'chaleureux',
      audience: form.audience?.trim() || undefined,
      description: form.description?.trim() || undefined,
      specialties: form.specialties?.trim() || undefined,
    };
    try {
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
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? colors.green : colors.border }} />
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Body soft size={14}>Étape {step} sur {STEPS}</Body>

        {step === 1 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LogoMark size={44} />
              <Title size={26} style={{ color: colors.green }}>Vitrine</Title>
            </View>
            <Title size={30}>Votre boutique</Title>
            <Body soft>Quelques informations pour écrire des posts qui vous ressemblent.</Body>
            <Field label="Votre prénom" value={form.ownerFirstName} onChangeText={(v) => set('ownerFirstName', v)} placeholder="Marie" error={errors.ownerFirstName} autoComplete="given-name" />
            <Field label="Nom de la boutique" value={form.businessName} onChangeText={(v) => set('businessName', v)} placeholder="Fleurs de Marie" error={errors.businessName} />
            <View style={{ gap: 10 }}>
              <Body style={{ fontWeight: '600' }}>Type de commerce</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {BUSINESS_TYPES.map((t) => (
                  <Chip key={t.id} label={`${t.emoji} ${t.label}`} selected={form.businessType === t.id} onPress={() => set('businessType', t.id as BusinessType)} />
                ))}
              </View>
              {errors.businessType ? <Body size={14} style={{ color: colors.red }}>{errors.businessType}</Body> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 2 }}><Field label="Ville" value={form.city} onChangeText={(v) => set('city', v)} placeholder="Lyon" error={errors.city} /></View>
              <View style={{ flex: 1.3 }}><Field label="Code postal" value={form.postalCode} onChangeText={(v) => set('postalCode', v.replace(/\D/g, '').slice(0, 5))} placeholder="69002" keyboardType="number-pad" error={errors.postalCode} /></View>
            </View>
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
            <Field label="Vos spécialités (facultatif)" value={form.specialties} onChangeText={(v) => set('specialties', v)} placeholder="Bouquets de saison, compositions de mariage" />
            <Field label="Vos clients (facultatif)" value={form.audience} onChangeText={(v) => set('audience', v)} placeholder="Familles du quartier, jeunes couples" />
            <Field label="Votre boutique en quelques mots (facultatif)" value={form.description} onChangeText={(v) => set('description', v)} placeholder="Fleuriste de quartier depuis 1998, fleurs françaises" multiline />
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
            <Body size={64}>🎉</Body>
            <Title size={30} style={{ textAlign: 'center' }}>Votre boutique est prête !</Title>
            <Body soft center>Prenez votre première photo, Vitrine s'occupe du reste.</Body>
            {saveError ? <Body style={{ color: colors.red }} center>{saveError}</Body> : null}
            <Button title="COMMENCER" onPress={finish} loading={saving} style={{ alignSelf: 'stretch', marginTop: 12 }} />
            <Button title="Retour" kind="ghost" onPress={() => setStep(3)} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
