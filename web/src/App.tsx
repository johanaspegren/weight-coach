import { HashRouter, Route, Routes } from "react-router-dom";

import { Checkin } from "./views/Checkin";
import { Detail } from "./views/Detail";
import { Home } from "./views/Home";
import { LogMeal } from "./views/LogMeal";
import { LogWeight } from "./views/LogWeight";
import { LogWorkout } from "./views/LogWorkout";

export function App() {
  return (
    <HashRouter>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/weight" element={<LogWeight />} />
          <Route path="/meal" element={<LogMeal />} />
          <Route path="/workout" element={<LogWorkout />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/detail/:date" element={<Detail />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
