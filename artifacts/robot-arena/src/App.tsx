import { useState } from "react";
import type { RobotSpec } from "./game/robots";
import SelectionScreen from "./pages/SelectionScreen";
import ArenaScreen from "./pages/ArenaScreen";

type Screen = "selection" | "arena";

export default function App() {
  const [screen, setScreen] = useState<Screen>("selection");
  const [playerSpec, setPlayerSpec] = useState<RobotSpec | null>(null);
  const [opponentSpec, setOpponentSpec] = useState<RobotSpec | null>(null);

  const handleFight = (player: RobotSpec, opponent: RobotSpec) => {
    setPlayerSpec(player);
    setOpponentSpec(opponent);
    setScreen("arena");
  };

  const handleExit = () => {
    setScreen("selection");
  };

  if (screen === "arena" && playerSpec && opponentSpec) {
    return (
      <ArenaScreen
        playerSpec={playerSpec}
        opponentSpec={opponentSpec}
        onExit={handleExit}
      />
    );
  }

  return <SelectionScreen onFight={handleFight} />;
}
