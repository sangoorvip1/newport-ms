/**
 * تصريحات بديلة (ambient) حتى يمرّ الفحص النوعي والاختبارات دون تثبيت حزم React Native الأصلية.
 * عند وجود الحزم الحقيقية (expo/react-native/@types/react) في node_modules تُقرأ أنواعها وتتفوق على هذه.
 */
declare module 'react' {
  export type ReactNode = any;
  export type ComponentType<P = Record<string, any>> = (props: P) => any;
  export type FC<P = Record<string, any>> = (props: P) => any;
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(fn: () => T, deps: any[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: any[]): T;
  export function useRef<T>(v: T): { current: T };
  export interface Context<T> {
    Provider: any;
    Consumer: any;
    _currentValue?: T;
  }
  export function useContext<T>(ctx: Context<T>): T;
  export function createContext<T>(def: T): Context<T>;
  export const Fragment: any;
  export function createElement(type: any, props?: any, ...children: any[]): any;
  const React: {
    createElement: typeof createElement;
    useState: typeof useState;
    useEffect: typeof useEffect;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
    useRef: typeof useRef;
    useContext: typeof useContext;
    createContext: typeof createContext;
    Fragment: typeof Fragment;
  };
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: (type: any, props: any, key?: any) => any;
  export const jsxs: (type: any, props: any, key?: any) => any;
  export const Fragment: any;
}

/** فضاء JSX مبسّط — يختفي عند توفر @types/react الحقيقية */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    type ElementType = any;
    type Element = any;
    interface ElementChildrenAttribute {
      children: any;
    }
  }
}

declare module 'react-native' {
  export const View: any;
  export const Text: any;
  export const ScrollView: any;
  export const FlatList: any;
  export const Pressable: any;
  export const TextInput: any;
  export const ActivityIndicator: any;
  export const SafeAreaView: any;
  export const RefreshControl: any;
  export const KeyboardAvoidingView: any;
  export const Modal: any;
  export const Switch: any;
  export const StyleSheet: { create: <T extends Record<string, any>>(s: T) => T; flatten: (s: any) => any };
  export const Platform: { OS: 'ios' | 'android' | 'web'; select<T>(o: { ios?: T; android?: T; native?: T; web?: T; default?: T }): T | undefined };
  export const Alert: { alert: (title: string, message?: string, buttons?: Array<{ text: string; onPress?: () => void; style?: string }>) => void };
}

declare module 'expo' {
  export function registerRootComponent(component: any): void;
  export const Constants: { expoConfig?: { extra?: Record<string, any> } };
}

declare module 'expo-sqlite' {
  export interface SQLiteResult<Row = Record<string, any>> {
    rows: Row[];
  }
  export interface SQLiteStatement {
    executeSync<T = Record<string, any>>(params?: any[]): SQLiteResult<T>;
    executeAsync<T = Record<string, any>>(params?: any[]): Promise<SQLiteResult<T>>;
  }
  export interface PreparedSQLTransaction {
    execAsync(source: string, params?: any[]): Promise<any>;
  }
  export interface SQLiteDatabase {
    execSync(source: string): void;
    execAsync(source: string): Promise<void>;
    prepareSync(source: string): SQLiteStatement;
    withTransactionAsync(tx: (t: PreparedSQLTransaction) => Promise<void>): Promise<void>;
  }
  export function openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}
