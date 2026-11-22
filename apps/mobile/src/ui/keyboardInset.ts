/**
 * How much of the screen the on-screen keyboard covers, so bottom sheets can sit above it.
 * KeyboardAvoidingView doesn't move absolutely positioned sheets, so sheets lift themselves.
 */
import { useEffect, useState } from "react";
import { Dimensions, Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from "react-native";

/** Space left between a lifted sheet and the status bar. */
const TOP_GAP = 16;

/** Height the keyboard covers, from the y of its top edge. */
export function keyboardInset(keyboardTopY: number, windowHeight: number): number {
  return Math.max(0, windowHeight - keyboardTopY);
}

/** Tallest a sheet may be while lifted above the keyboard; undefined when the keyboard is down. */
export function sheetMaxHeight(windowHeight: number, inset: number, safeTop: number): number | undefined {
  return inset > 0 ? windowHeight - inset - safeTop - TOP_GAP : undefined;
}

/** Live keyboard height. iOS only: Android resizes the window for the keyboard by itself. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    const update = (e: KeyboardEvent) => {
      LayoutAnimation.configureNext({
        duration: e.duration || 250,
        update: { type: LayoutAnimation.Types.keyboard },
      });
      setInset(keyboardInset(e.endCoordinates.screenY, Dimensions.get("window").height));
    };
    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", update),
      Keyboard.addListener("keyboardWillHide", update),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return inset;
}
