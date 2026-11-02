import { useEffect, useRef, useState } from "react";

/**
 * Índice de secciones bajo una barra fija: sabe cuál se está viendo y
 * desplaza hasta una sin que la barra la tape. Cada sección se busca por el
 * `id` de su título (`<h2 id>` dentro de la `<section>`).
 */
export function useSectionIndex(ids: string[], enabled: boolean) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(ids[0] ?? "");

  function scroller() {
    return bar.current?.closest<HTMLElement>(".main-area") ?? null;
  }

  /** Distancia desde arriba del área con scroll a la que debe quedar una sección. */
  function offset() {
    return (bar.current?.offsetHeight ?? 0) + 16;
  }

  function sectionOf(id: string) {
    return document.getElementById(id)?.closest("section") ?? null;
  }

  useEffect(() => {
    const container = scroller();
    if (!enabled || !container) return;
    function update() {
      const top = container!.getBoundingClientRect().top + offset() + 8;
      let current = ids[0];
      for (const id of ids) {
        const section = sectionOf(id);
        if (section && section.getBoundingClientRect().top <= top) current = id;
      }
      // Al llegar al final se marca la última aunque no alcance la barra.
      if (container!.scrollTop + container!.clientHeight >= container!.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    }
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [enabled, ids.join()]);

  function go(id: string) {
    const container = scroller();
    const section = sectionOf(id);
    if (!container || !section) return;
    const top =
      container.scrollTop +
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      offset();
    container.scrollTo({ top, behavior: "smooth" });
    setActive(id);
  }

  return { bar, active, go };
}
