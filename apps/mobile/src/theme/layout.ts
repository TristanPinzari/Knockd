export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const radii = { card: 20, row: 16, sheetTop: 28, tile: 14 } as const;

/** Pill radius: half the height, for every pill, chip, segmented control and button. */
export const pill = (height: number): number => height / 2;

export const sizes = { buttonHeight: 48, smallButtonHeight: 36, hairline: 1, tabBarHeight: 83 } as const;
