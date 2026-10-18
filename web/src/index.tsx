import { HashRouter, Navigate, Route } from "@solidjs/router";
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import App from "./App";
import "./styles.css";

const ActivitiesPage = lazy(() => import("./pages/activities/ActivitiesPage"));
const ActivityPage = lazy(() => import("./pages/activity/ActivityPage"));
const ComparePage = lazy(() => import("./pages/compare/ComparePage"));
const FitnessTrendPage = lazy(() => import("./pages/fitness-trend/FitnessTrendPage"));
const YearProgressPage = lazy(() => import("./pages/year-progress/YearProgressPage"));
const AthletePage = lazy(() => import("./pages/settings/AthletePage"));
const ZonesPage = lazy(() => import("./pages/settings/ZonesPage"));
const GlobalSettingsPage = lazy(() => import("./pages/settings/GlobalSettingsPage"));

// Hash routing, like the original app: works under any mount path with no server rewrites.
render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={() => <Navigate href="/activities" />} />
      <Route path="/activities" component={ActivitiesPage} />
      <Route path="/activity/compare/:ids" component={ComparePage} />
      <Route path="/activity/:id" component={ActivityPage} />
      <Route path="/fitness-trend" component={FitnessTrendPage} />
      <Route path="/year-progress" component={YearProgressPage} />
      <Route path="/athlete" component={AthletePage} />
      <Route path="/zones/:zone?" component={ZonesPage} />
      <Route path="/settings" component={GlobalSettingsPage} />
      <Route path="*" component={() => <Navigate href="/activities" />} />
    </HashRouter>
  ),
  document.getElementById("root")!
);
