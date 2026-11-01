import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, TAB_ROUTES, useApp } from './src/lib/store';
import { colors, fonts } from './src/lib/theme';
import { CalendarIcon, GridIcon, HomeIcon } from './src/components/icons';
import { Onboarding } from './src/screens/Onboarding';
import { Home } from './src/screens/Home';
import { Create } from './src/screens/Create';
import { Published } from './src/screens/Published';
import { Fetes } from './src/screens/Fetes';
import { Posts } from './src/screens/Posts';
import { Settings } from './src/screens/Settings';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { ready, business, route } = useApp();
  const insets = useSafeAreaInsets();
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View>;
  }
  if (!business) return <Onboarding />;

  const isTab = (TAB_ROUTES as readonly string[]).includes(route.name);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingTop: insets.top, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {route.name === 'home' && <Home />}
        {route.name === 'fetes' && <Fetes />}
        {route.name === 'posts' && <Posts />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'create' && <Create key={route.occasionId ?? 'new'} occasionId={route.occasionId} />}
        {route.name === 'published' && <Published postId={route.postId} />}
      </View>
      {isTab && <TabBar />}
    </View>
  );
}

function TabBar() {
  const { route, go } = useApp();
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: 'home' as const, label: 'Accueil', Icon: HomeIcon },
    { name: 'fetes' as const, label: 'Fêtes', Icon: CalendarIcon },
    { name: 'posts' as const, label: 'Mes posts', Icon: GridIcon },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8 }}>
      {tabs.map(({ name, label, Icon }) => {
        const active = route.name === name;
        const c = active ? colors.green : colors.textSoft;
        return (
          <Pressable key={name} onPress={() => go({ name })} accessibilityRole="tab" accessibilityState={{ selected: active }} style={{ flex: 1, alignItems: 'center', gap: 4, minHeight: 52, justifyContent: 'center' }}>
            <Icon color={c} size={26} />
            <Text style={{ color: c, fontSize: 13, fontWeight: active ? '700' : '500', fontFamily: fonts.body }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
