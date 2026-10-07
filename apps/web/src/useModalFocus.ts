import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const dialog: HTMLElement = node;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;

    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("disabled")
      );

    const initial =
      focusables().find(
        (el) =>
          !el.classList.contains("whats-new-close") &&
          (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")
      ) ??
      focusables().find((el) => !el.classList.contains("whats-new-close")) ??
      focusables()[0] ??
      dialog;
    initial.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    const overlay = dialog.closest("[data-modal-root]") ?? dialog;
    const parent = overlay.parentElement;
    const inerted: HTMLElement[] = [];
    if (parent) {
      for (const child of Array.from(parent.children)) {
        if (child instanceof HTMLElement && child !== overlay) {
          child.inert = true;
          inerted.push(child);
        }
      }
    }

    return () => {
      document.removeEventListener("keydown", onKey, true);
      for (const el of inerted) el.inert = false;
      previous?.focus();
    };
  }, [open, onClose]);

  return ref;
}
