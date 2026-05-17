import '@mui/material/styles';
import '@mui/material/Typography';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    displayLarge: React.CSSProperties;
    displayMedium: React.CSSProperties;
    displaySmall: React.CSSProperties;
    headlineLarge: React.CSSProperties;
    headlineMedium: React.CSSProperties;
    headlineSmall: React.CSSProperties;
    titleLarge: React.CSSProperties;
    titleMedium: React.CSSProperties;
    titleSmall: React.CSSProperties;
    bodyLarge: React.CSSProperties;
    bodyMedium: React.CSSProperties;
    bodySmall: React.CSSProperties;
    labelLarge: React.CSSProperties;
    labelMedium: React.CSSProperties;
    labelSmall: React.CSSProperties;
  }

  interface Palette {
    tertiary: PaletteColor;
    surfaceContainer: string;
    surfaceContainerLow: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
  }

  interface PaletteOptions {
    tertiary?: PaletteColorOptions;
    surfaceContainer?: string;
    surfaceContainerLow?: string;
    surfaceContainerHigh?: string;
    surfaceContainerHighest?: string;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    displayLarge: true;
    displayMedium: true;
    displaySmall: true;
    headlineLarge: true;
    headlineMedium: true;
    headlineSmall: true;
    titleLarge: true;
    titleMedium: true;
    titleSmall: true;
    bodyLarge: true;
    bodyMedium: true;
    bodySmall: true;
    labelLarge: true;
    labelMedium: true;
    labelSmall: true;
  }
}
