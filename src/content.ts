/**
 * Content-script entry. Kept deliberately tiny: it just kicks off the logic in `content-core`,
 * which is where everything testable lives.
 */
import { runContentScript } from "./content-core";

void runContentScript();
