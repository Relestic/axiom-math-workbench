import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./Root";
import { DataProvider } from "./app/DataProvider";
import { SessionProvider } from "./lib/session";
import { AIConnectionProvider } from "./modules/ai/connection";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SessionProvider>
      <DataProvider>
        <AIConnectionProvider>
          <Root />
        </AIConnectionProvider>
      </DataProvider>
    </SessionProvider>
  </React.StrictMode>,
);
