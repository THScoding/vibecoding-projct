import { useState } from "react";
import type { RobotTemplate } from "./game/types";
import SelectionScreen from "./pages/SelectionScreen";
import ArenaScreen from "./pages/ArenaScreen";

type Screen = "selection" | "arena";

export default function App() {
  const [screen, setScreen] = useState<Screen>("selection");
  const [playerTemplate, setPlayerTemplate] = useState<RobotTemplate | null>(null);

  const handleSelect = (template: RobotTemplate) => {
    setPlayerTemplate(template);
    setScreen("arena");
  };

  const handleExit = () => {
    setScreen("selection");
    setPlayerTemplate(null);
  };

  if (screen === "arena" && playerTemplate) {
    return <ArenaScreen playerTemplate={playerTemplate} onExit={handleExit} />;
  }

  return <SelectionScreen onSelect={handleSelect} />;
}
