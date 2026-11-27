import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BackButton, Body, Button, Card, Field, Notice, Title } from '../components/ui';
import { TradePicker, type TradeValue } from '../components/TradePicker';
import { ShopFinder } from '../components/ShopFinder';
import { guessTrade } from '../lib/trades';
import type { ShopMatch } from '../lib/shopLookup';
import { PlusIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { addShop, FriendlyError, NotConfiguredError } from '../lib/api';
import { euros, offersFrom } from '../lib/billing';

/**
 * Ajouter une boutique (patron) : nom, métier, ville. Pas de nouvel essai gratuit :
 * il faut une offre en cours, et la boutique est ajoutée à l'abonnement (19 € ou 15 € par mois en plus).
 */
export function ShopAdd() {
  const { back, go, business, billing, refreshTeam, switchShop, refreshBilling } = useApp();
  const [name, setName] = useState(business?.businessName ?? '');
  const [trade, setTrade] = useState<TradeValue>({ businessType: business?.businessType, trade: business?.trade });
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [picked, setPicked] = useState<ShopMatch | null>(null);
  const [busy, setBusy] = useState(false);

  // Boutique touchée dans la liste de l'annuaire : ville, code postal et métier se remplissent.
  function pick(shop: ShopMatch) {
    const t = guessTrade(shop.names, shop.naf);
    setPicked(shop);
    if (shop.city) setCity(shop.city);
    if (shop.postalCode) setPostalCode(shop.postalCode);
    if (t) setTrade({ businessType: t.id, trade: t.label });
  }
  const [error, setError] = useState<string | null>(null);

  const access = billing?.access;
  const subscribed = access === 'paid' || access === 'free' || !billing?.configured;
  const offer = offersFrom(billing).find((o) => o.id === billing?.subscription?.plan);
  const price = offer ? `${euros(offer.extraShopCents)} par mois en plus` : '19 € par mois en plus (15 € avec l\'offre Annuel)';
  const valid = name.trim().length > 1 && city.trim().length > 1 && /^\d{5}$/.test(postalCode.trim()) && Boolean(trade.businessType);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const shop = await addShop({ businessName: name.trim(), businessType: trade.businessType ?? 'autre', trade: trade.trade, city: city.trim(), postalCode: postalCode.trim() });
      await refreshTeam();
      await refreshBilling();
      back();
      if (shop.id) await switchShop(shop.id);
    } catch (e) {
      setError(e instanceof NotConfiguredError ? "L'ajout de boutiques n'est pas encore activé sur le serveur." : e instanceof FriendlyError ? e.message : 'Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={26} style={{ flex: 1 }}>Ajouter une boutique</Title>
      </View>

      {!subscribed ? (
        <>
          <Notice tone="orange" title="Choisissez d'abord votre offre" text="Pendant l'essai gratuit, Vitrine se découvre avec une boutique. Une fois votre offre choisie, vous ajoutez vos autres boutiques ici." />
          <Button title="Voir les offres" onPress={() => go({ name: 'offers' })} />
        </>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <Body style={{ fontWeight: '700' }}>{price}</Body>
            <Body soft size={15}>Chaque boutique a ses propres posts, son planning et ses comptes Instagram et Facebook. Vos employés restent gratuits.</Body>
          </Card>
          <Field label="Nom de la boutique" value={name} onChangeText={setName} placeholder="Ex. : Fleurs de Marie" />
          <Field label="Code postal" value={postalCode} onChangeText={(v) => { setPostalCode(v.replace(/\D/g, '').slice(0, 5)); setPicked(null); }} keyboardType="number-pad" placeholder="Ex. : 13001" />
          <Field label="Ville" value={city} onChangeText={(v) => { setCity(v); setPicked(null); }} placeholder="Ex. : Marseille" />
          <ShopFinder name={name} postalCode={postalCode} city={city} picked={picked} onPick={pick} onUnpick={() => setPicked(null)} />
          <TradePicker value={trade} onChange={setTrade} />
          {error && <Notice tone="red" title={error} />}
          <Button title="Ajouter la boutique" icon={<PlusIcon size={22} color={colors.white} />} loading={busy} disabled={!valid} onPress={submit} style={{ minHeight: 60 }} />
          <Body soft size={14} center>Le prix est ajouté à votre abonnement, au prorata des jours restants ce mois-ci.</Body>
        </>
      )}
    </ScrollView>
  );
}
