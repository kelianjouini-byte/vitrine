import React, { useState } from 'react';
import { Body, Button, Card, Notice } from './ui';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { isBackendConfigured } from '../lib/config';
import { currentUserId, deleteAccountRemote, FriendlyError, signOut } from '../lib/api';

/** « Supprimer mon compte », avec confirmation. Toujours accessible, même quand l'essai gratuit est terminé (RGPD). */
export function DeleteAccount() {
  const { resetAll } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteEverything() {
    setDeleting(true);
    setError(null);
    try {
      if (isBackendConfigured && (await currentUserId())) {
        await deleteAccountRemote();
        await signOut();
      }
      await resetAll();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'La suppression a échoué. Réessayez.');
      setDeleting(false);
    }
  }

  if (!confirm) return <Button title="Supprimer mon compte" kind="danger" onPress={() => setConfirm(true)} />;
  return (
    <Card style={{ gap: 12, borderColor: colors.red }}>
      <Body style={{ fontWeight: '700' }}>Tout supprimer ?</Body>
      <Body soft size={15}>Votre boutique, vos posts et vos connexions seront effacés, et votre abonnement arrêté. Les posts déjà en ligne restent sur Instagram et Facebook.</Body>
      {error && <Notice tone="red" title={error} />}
      <Button title="Oui, tout supprimer" kind="danger" loading={deleting} onPress={deleteEverything} />
      <Button title="Annuler" kind="ghost" onPress={() => setConfirm(false)} />
    </Card>
  );
}
