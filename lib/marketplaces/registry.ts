import { mercadoLivreAdapter } from "@/lib/marketplaces/mercadolivre";
import type {
  MarketplaceAdapter,
  MarketplaceProvider
} from "@/lib/marketplaces/types";

const adapters: Record<MarketplaceProvider, MarketplaceAdapter> = {
  mercadolivre: mercadoLivreAdapter,
  amazon: {
    provider: "amazon",
    displayName: "Amazon",
    capabilities: ["orders", "inventory", "advertising", "listings"]
  },
  shopee: {
    provider: "shopee",
    displayName: "Shopee",
    capabilities: ["orders", "inventory", "advertising", "listings", "promotions"]
  },
  magalu: {
    provider: "magalu",
    displayName: "Magalu",
    capabilities: ["orders", "inventory", "listings", "promotions"]
  },
  custom: {
    provider: "custom",
    displayName: "Marketplace personalizado",
    capabilities: ["orders", "inventory", "listings"]
  }
};

export function getMarketplaceAdapter(provider: MarketplaceProvider) {
  return adapters[provider];
}

export function listMarketplaceAdapters() {
  return Object.values(adapters);
}
