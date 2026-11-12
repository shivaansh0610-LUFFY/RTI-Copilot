import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts between tests by itself when the test globals are on.
afterEach(cleanup);

// findBy... gives up after 1 s by default, which a busy machine running the whole suite in
// parallel (with the API and its model loaded) occasionally exceeded.
configure({ asyncUtilTimeout: 3000 });
