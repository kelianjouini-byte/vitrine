import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Body, Card, Title } from './ui';
import { ChartUpIcon } from './icons';
import { colors, fonts } from '../lib/theme';
import { useApp } from '../lib/store';
import { monthOf, postsOfMonth } from '../lib/report';

/**
 * Carte « Mon bilan » de l'accueil : le vrai nombre de posts publiés ce mois-ci.
 * L'icône qui monte est décorative (ce n'est pas une courbe de données).
 * Plus tard, quand Meta sera branché, le chiffre deviendra le nombre de vues.
 */
export function MonthReportCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { posts, go } = useApp();
  const count = postsOfMonth(posts, monthOf(new Date())).length;
  return (
    <Card onPress={() => go({ name: 'report' })} style={[{ gap: 6 }, style]}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        accessible
        accessibilityLabel={`Mon bilan : ${count} ${count > 1 ? 'posts' : 'post'} ce mois-ci. Toucher pour ouvrir.`}
      >
        <Title size={30}>{count}</Title>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          <ChartUpIcon size={20} color={colors.green} />
        </View>
      </View>
      <Body soft size={14}>{count > 1 ? 'posts ce mois-ci' : 'post ce mois-ci'}</Body>
      <Text style={{ color: colors.green, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>Mon bilan ›</Text>
    </Card>
  );
}
