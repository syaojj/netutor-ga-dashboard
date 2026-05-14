import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getChartTheme, type ChartTheme, type ColorMode } from '../chartTheme';
import { PLOTLY_HOVERLABEL, PLOTLY_HOVERLABEL_DARK } from '../fonts';

const STORAGE_KEY = 'ne-tutor-color-mode';

type ThemeContextValue = {
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  chartTheme: ChartTheme;
  plotlyHoverlabel: typeof PLOTLY_HOVERLABEL | typeof PLOTLY_HOVERLABEL_DARK;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ColorMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => readStoredMode());

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
    try {
      localStorage.setItem(STORAGE_KEY, colorMode);
    } catch {
      /* ignore */
    }
  }, [colorMode]);

  const setColorMode = useCallback((m: ColorMode) => {
    setColorModeState(m);
  }, []);

  const chartTheme = useMemo(() => getChartTheme(colorMode), [colorMode]);
  const plotlyHoverlabel = useMemo(
    () => (colorMode === 'dark' ? PLOTLY_HOVERLABEL_DARK : PLOTLY_HOVERLABEL),
    [colorMode],
  );

  const value = useMemo(
    (): ThemeContextValue => ({
      colorMode,
      setColorMode,
      chartTheme,
      plotlyHoverlabel,
      isDark: colorMode === 'dark',
    }),
    [colorMode, setColorMode, chartTheme, plotlyHoverlabel],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme는 ThemeProvider 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}

export type { ColorMode } from '../chartTheme';
