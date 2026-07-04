import { ScrapingManager } from "./ScrapingManager"
import { ScrapingRegistry } from "./ScrapingRegistry"
import { AccessBankScraper } from "./bank/AccessBankScraper"
import { EcobankScraper } from "./bank/EcobankScraper"
import { FirstBankScraper } from "./bank/FirstBankScraper"
import { GTBankScraper } from "./bank/GTBankScraper"
import { RenmoneyScraper } from "./bank/RenmoneyScraper"
import { ZenithScraper } from "./bank/ZenithScraper"
// import { OpayBankScraper } from "./bank/OpayBankScraper";
import { WemaBankScraper } from "./bank/WemaBankScraper"

export function createScrapingManager(): ScrapingManager {
    const registry = new ScrapingRegistry()
    registry.register(new WemaBankScraper())
    // registry.register(new OpayBankScraper());
    registry.register(new GTBankScraper())
    registry.register(new EcobankScraper())
    registry.register(new FirstBankScraper())
    registry.register(new ZenithScraper())
    registry.register(new RenmoneyScraper())
    registry.register(new AccessBankScraper())
    return new ScrapingManager(registry)
}
