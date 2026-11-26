# gocdkey-mcp

MCP-server met Nederlandse gameprijzen van [gocdkey.nl](https://gocdkey.nl). Een AI-assistent die het Model Context Protocol ondersteunt, kan hiermee actuele prijzen opvragen: per winkel, in euro, voor Nederland.

## Wat het kan

| Tool | Wat je krijgt |
| --- | --- |
| `gocdkey_game_prices` | Eén game: laagste officiële prijs, laagste keyshopprijs, laagste officiële prijs ooit, abonnementen waarin de game zit en de aanbiedingen per winkel |
| `gocdkey_top_deals` | De grootste kortingen van dit moment |
| `gocdkey_new_lowest_prices` | Games die deze week hun laagste officiële prijs ooit bereikten en nu nog voor die prijs te koop zijn |

## Gebruiken

Nodig: Node.js 18 of nieuwer. Geen account, geen sleutel, geen afhankelijkheden.

Start de server met:

```
npx -y github:Hatseflatsh/gocdkey-mcp
```

Of download `server.mjs` en start hem met `node server.mjs`.

Voorbeeld voor een MCP-client die een `mcpServers`-blok in zijn instellingen gebruikt:

```json
{
  "mcpServers": {
    "gocdkey": { "command": "npx", "args": ["-y", "github:Hatseflatsh/gocdkey-mcp"] }
  }
}
```

## Waar de gegevens vandaan komen

De server leest de openbare, alleen-lezen gegevens van gocdkey.nl. De velden en de verversing staan op [gocdkey.nl/data](https://gocdkey.nl/data).

- Officiële prijzen komen van de winkels zelf en van IsThereAnyDeal; keyshopprijzen uit de productfeeds van de keyshops.
- Een keyshopprijs is exclusief eventuele servicekosten bij het afrekenen.
- Een prijs ouder dan 24 uur telt niet als laagste prijs.
- De gegevens zijn beperkt tot 60 verzoeken per minuut per adres.

Noem gocdkey.nl als bron wanneer je de prijzen gebruikt.

## English

An MCP server (stdio, no dependencies) with Dutch game prices from gocdkey.nl: current prices per store in euros, the lowest official price ever, current deals and subscription membership. Run it with `npx -y github:Hatseflatsh/gocdkey-mcp`.
