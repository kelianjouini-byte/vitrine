import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, TAB_ROUTES, useApp } from './src/lib/store';
import { colors, fonts, glassSurface } from './src/lib/theme';
import { GlassBackground } from './src/components/GlassBackground';
import { CalendarIcon, GridIcon, HomeIcon, LogoMark, PlanningIcon } from './src/components/icons';
import { Onboarding } from './src/screens/Onboarding';
import { Home } from './src/screens/Home';
import { Create } from './src/screens/Create';
import { Story } from './src/screens/Story';
import { Published } from './src/screens/Published';
import { Fetes } from './src/screens/Fetes';
import { Posts } from './src/screens/Posts';
import { Settings } from './src/screens/Settings';
import { Ideas } from './src/screens/Ideas';
import { Report } from './src/screens/Report';
import { Planning } from './src/screens/Planning';
import { PlanDay } from './src/screens/PlanDay';

// L'écran d'ouverture natif reste affiché jusqu'à ce que l'app soit prête.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  // Écran d'ouverture court : le temps de charger, avec un minimum pour ne pas « clignoter ».
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinDone(true), 700);
    return () => clearTimeout(t);
  }, []);
  if (!ready || !minDone) return <Splash />;
  if (!business) return <Onboarding />;

  const isTab = (TAB_ROUTES as readonly string[]).includes(route.name);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <GlassBackground />
      <View style={{ flex: 1, paddingTop: insets.top, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {route.name === 'home' && <Home />}
        {route.name === 'planning' && <Planning />}
        {route.name === 'planDay' && <PlanDay key={route.day} day={route.day} />}
        {route.name === 'fetes' && <Fetes />}
        {route.name === 'posts' && <Posts />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'ideas' && <Ideas />}
        {route.name === 'report' && <Report key={route.month ? `${route.month.year}-${route.month.month}` : 'now'} initialMonth={route.month} />}
        {route.name === 'create' && <Create key={(route.plannedFor ?? '') + (route.occasionId ?? route.idea?.title ?? 'new')} occasionId={route.occasionId} initialPhoto={route.photo} idea={route.idea} plannedFor={route.plannedFor} />}
        {route.name === 'story' && <Story />}
        {route.name === 'published' && <Published postId={route.postId} />}
      </View>
      {isTab && <TabBar />}
    </View>
  );
}

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <LogoMark size={130} onGreen />
      <Text style={{ color: colors.white, fontSize: 42, fontFamily: fonts.title, fontWeight: '600' }}>Vitrine</Text>
      <Text style={{ color: colors.white, fontSize: 17, fontFamily: fonts.body, textAlign: 'center' }}>Une photo, on s'occupe du reste.</Text>
    </View>
  );
}

function TabBar() {
  const { route, go } = useApp();
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: 'home' as const, label: 'Accueil', Icon: HomeIcon },
    { name: 'planning' as const, label: 'Planning', Icon: PlanningIcon },
    { name: 'fetes' as const, label: 'Fêtes', Icon: CalendarIcon },
    { name: 'posts' as const, label: 'Mes posts', Icon: GridIcon },
  ];
  return (
    // Barre d'onglets « flottante » en verre, posée au-dessus du fond.
    <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12), paddingTop: 4 }}>
      <View style={{ ...glassSurface, flexDirection: 'row', borderRadius: 26, paddingVertical: 6, paddingHorizontal: 4, width: '100%', maxWidth: 528, alignSelf: 'center' }}>
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
    </View>
  );
}
