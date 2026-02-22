# AgenticShop — Amazon-like Static Prototype (UI-inspired)

Static HTML/CSS/JS prototype with:
- Amazon-like top nav + search
- Product result grid cards
- Compare (up to 3)
- Cart + JSON export
- Mock agent panel (shortlist / bundle / negotiate / summarize)

## Run
```bash
cd agentic-shopping-amazon
python -m http.server 8000
# open http://localhost:8000
```

## Customize
- Replace `data_products.json` with your real catalog feed output.
- Replace mock tools in `src/app.js` with your backend (RAG + tool calling + checkout).
