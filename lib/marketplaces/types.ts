export type MarketplaceProvider =
  | "mercadolivre"
  | "amazon"
  | "shopee"
  | "magalu"
  | "custom";

export type MarketplaceCapability =
  | "orders"
  | "inventory"
  | "advertising"
  | "listings"
  | "promotions"
  | "notifications";

export type MarketplaceAccount = {
  id: string;
  organizationId: string;
  provider: MarketplaceProvider;
  externalSellerId: string;
  accountName: string;
  siteId?: string;
  status: "pending" | "connected" | "expired" | "disabled";
  lastSyncAt?: string;
};

export type AuthorizationUrlInput = {
  clientId: string;
  redirectUri: string;
  state: string;
  siteId?: string;
};

export type MarketplaceAdapter = {
  provider: MarketplaceProvider;
  displayName: string;
  capabilities: MarketplaceCapability[];
  buildAuthorizationUrl?: (input: AuthorizationUrlInput) => string;
};

export type MarketplaceSyncResource =
  | "orders"
  | "inventory"
  | "advertising"
  | "listings"
  | "promotions";
