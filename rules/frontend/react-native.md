# Reglas React Native / Expo

Reglas para desarrollo mobile con React Native y Expo en este proyecto.

## Stack

- React Native (New Architecture: Fabric + TurboModules)
- Expo SDK y EAS Build
- TypeScript estricto
- Expo Router (file-based navigation)
- TanStack Query / SWR para data fetching
- Zustand / Jotai para estado global
- expo-secure-store para persistencia segura
- react-native-reanimated para animaciones
- StyleSheet o NativeWind para estilos
- FlatList / FlashList para listas virtualizadas
- Testing con Jest + @testing-library/react-native
- E2E con Maestro o Detox

## Reglas

1. **Expo Router**: Mantén los archivos `app/**` delgados, validando deep links con Zod.
2. **Estado**: Server state con TanStack Query, UI state con Zustand/Context, no duplicar.
3. **Listas**: FlatList/FlashList, nunca `.map()` en ScrollView para datos grandes.
4. **Animaciones**: Preferir react-native-reanimated sobre Animated API.
5. **Persistencia segura**: expo-secure-store para tokens, AsyncStorage solo para datos no sensibles.
6. **TypeScript**: Sin errores ni warnings. Nunca usar `any`. Validar datos externos con Zod.
7. **Tests**: Genera tests unitarios con @testing-library/react-native.
8. **Salvaguardas**: Nunca uses `--no-verify` o `-n` para saltarte los hooks de Husky.
9. **Sin console.log** en producción. Usar logger que se stripee en build.