/**
 * Which layer app lines and fills are drawn under, so street names stay on top. It's the labels
 * anchor while the themed style is showing; undefined with the plain server style (used while
 * the themed one loads, or offline when it can't), which has no anchor: then layers go on top.
 */
import { createContext, useContext } from "react";

export const LabelsAnchorContext = createContext<string | undefined>(undefined);

export function useLabelsAnchor(): string | undefined {
  return useContext(LabelsAnchorContext);
}
