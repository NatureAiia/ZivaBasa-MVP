// Shiny Pill — Originkit, adapted from the Framer TS source to plain React/JSX.
// Extended with a second shine color (shineColor2) so the sweep is a two-tone gradient
// instead of one flat color — textColor + shineColor + shineColor2 = 3 colors total.

const KEYFRAMES_ID = "shiny-pill-keyframes";

export default function ShinyPill(props) {
  props = { ...COMPONENT_DEFAULTS, ...props };
  const { text, link, textColor, shineColor, shineColor2, speed, font, style } = props;

  const isFixedWidth = style?.width === "100%";
  const shellStyle = {
    ...style,
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    boxSizing: "border-box",
    ...(isFixedWidth ? {} : { minWidth: "max-content", width: "auto" }),
    whiteSpace: "nowrap",
    ...font,
  };

  // Gradient text fill for the shine layer — a real two-stop gradient (shineColor ->
  // shineColor2) clipped to the text, rather than one flat sweep color.
  const shineLayerStyle = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    backgroundImage: `linear-gradient(90deg, ${shineColor}, ${shineColor2 || shineColor})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    pointerEvents: "none",
    WebkitMaskImage: "linear-gradient(to right, transparent 30%, #000 50%, transparent 70%)",
    maskImage: "linear-gradient(to right, transparent 30%, #000 50%, transparent 70%)",
    WebkitMaskSize: "150% auto",
    maskSize: "150% auto",
    animation: `shinyPillSweep ${speed}s ease-in-out infinite`,
  };

  const content = (
    <div style={shellStyle}>
      <style
        id={KEYFRAMES_ID}
        dangerouslySetInnerHTML={{
          __html: `@keyframes shinyPillSweep {
                        0% { -webkit-mask-position: 200%; mask-position: 200%; }
                        100% { -webkit-mask-position: -100%; mask-position: -100%; }
                    }`,
        }}
      />
      <span style={{ color: textColor }}>{text}</span>
      <span style={shineLayerStyle} aria-hidden="true">
        {text}
      </span>
    </div>
  );

  if (link) {
    return (
      <a href={link} style={{ textDecoration: "none", display: "inline-flex" }}>
        {content}
      </a>
    );
  }
  return content;
}

const COMPONENT_DEFAULTS = {
  text: "SHINY PILL",
  textColor: "#FFFFFF",
  shineColor: "#78FF83",
  shineColor2: null,
  speed: 1.5,
  font: { fontFamily: "Inter", variant: "Bold", fontSize: "120px", letterSpacing: "-0.01em", lineHeight: "1em" },
};
