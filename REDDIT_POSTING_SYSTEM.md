# StockSpot Enhanced Reddit Posting System

## 🎯 Overview

The enhanced Reddit posting system provides centralized subreddit management, intelligent routing, safety features, and production-grade reliability for StockSpot's autonomous Reddit deal bot.

## 🏗️ System Architecture

### Core Components

1. **SubredditConfig.js** - Centralized configuration and routing logic
2. **RedditPoster.js** - Enhanced posting engine with safety features  
3. **ObserverMode.js** - Safe warm-up system (existing)
4. **Configuration Manager** - CLI utility for managing settings

### Key Features

- ✅ **Centralized Configuration**: All subreddit rules in one place
- ✅ **Intelligent Routing**: Category-to-subreddit selection with fallbacks
- ✅ **Cooldown Enforcement**: Per-subreddit posting limits with persistence
- ✅ **Daily Limits**: Prevent spamming with configurable daily caps
- ✅ **Duplicate Detection**: Track posted products to avoid repeats
- ✅ **Safety Guards**: Observer mode, rate limiting, error handling
- ✅ **Multi-Category Support**: Single subreddits can accept multiple categories
- ✅ **Admin Controls**: Disable/enable subreddits, reset cooldowns

## 📋 Subreddit Configuration

### Current Subreddits

| Subreddit | Categories | Cooldown | Daily Limit | Affiliate |
|-----------|------------|----------|-------------|-----------|
| **PokemonTCG** | pokemon_tcg | 6h | 3/day | ✅ |
| **OnePieceTCG** | one_piece_tcg | 6h | 3/day | ✅ |
| **tradingcardcommunity** | sports_cards, pokemon_tcg, one_piece_tcg | 4h | 4/day | ✅ |
| **GameDeals** | gaming | 4h | 5/day | ✅ |
| **deals** | electronics, collectibles, toys, other | 8h | 2/day | ✅ |
| **collectibles** | collectibles, pokemon_tcg, one_piece_tcg, sports_cards | 6h | 3/day | ✅ |
| **toys** | toys | 8h | 2/day | ✅ |

### Configuration Options

Each subreddit supports these settings:

```javascript
{
  name: 'PokemonTCG',
  allowedCategories: ['pokemon_tcg'],
  minCooldownHours: 6,
  maxPostsPerDay: 3,
  affiliateAllowed: true,
  disabled: false,
  titleVariations: [...] // Multiple title templates
}
```

## 🎛️ Usage

### Basic Posting

```javascript
const RedditPoster = require('./services/RedditPoster');
const poster = new RedditPoster();

const product = {
  id: 'pokemon-sv-box-1',
  name: 'Pokemon Scarlet & Violet Booster Box',
  category: 'pokemon_tcg',
  currentPrice: 89.99,
  originalPrice: 119.99,
  url: 'https://example.com/pokemon-box',
  affiliateUrl: 'https://example.com/pokemon-box?tag=stockspot'
};

const result = await poster.postDeal(product);
console.log(result);
```

### Configuration Management

```bash
# Check system status
node reddit_config_manager.js status

# Test category routing
node reddit_config_manager.js category pokemon_tcg

# Disable problematic subreddit
node reddit_config_manager.js disable PokemonTCG "Temporary ban"

# Re-enable subreddit
node reddit_config_manager.js enable PokemonTCG

# Test posting logic
node reddit_config_manager.js test gaming "Zelda BOTW"

# View post history
node reddit_config_manager.js history 20
```

## 🛡️ Safety Features

### Observer Mode Integration

- **Safe Warm-up**: New accounts browse subreddits without posting
- **Gradual Activity**: Simulates normal user behavior
- **Automatic Disable**: Observer mode auto-disables after configured days

### Cooldown Enforcement

- **Per-Subreddit Cooldowns**: Prevent spam with configurable intervals
- **Persistent State**: Cooldowns survive server restarts
- **Daily Limits**: Cap posts per subreddit per 24h period
- **Intelligent Reset**: Daily counters reset after 24h

### Duplicate Prevention

- **Product Tracking**: Remember posted products by ID/URL
- **24-Hour Window**: Prevent same product posts within 24h
- **Cross-Subreddit**: Tracks duplicates across all subreddits

### Error Handling

- **Rate Limit Detection**: Automatically handles Reddit rate limits
- **Authentication Recovery**: Re-authenticates on token expiry
- **Subreddit Failures**: Auto-disable problematic subreddits
- **Comprehensive Logging**: Detailed logs for debugging

## 🎯 Routing Logic

### Category Selection Process

1. **Find Valid Subreddits**: Get all subreddits that accept the category
2. **Apply Filters**: Remove disabled subreddits and those on cooldown
3. **Check Daily Limits**: Exclude subreddits at daily posting limit
4. **Select Best Option**: Choose subreddit with longest time since last post
5. **Generate Content**: Use subreddit-specific title variations

### Example Routing

For `pokemon_tcg` category:
1. Valid options: PokemonTCG, tradingcardcommunity, collectibles
2. Filter by cooldown: Only tradingcardcommunity available (4h cooldown)
3. Check daily limits: 2/4 posts used today ✅
4. Selected: tradingcardcommunity
5. Title: "Deal Alert: Pokemon Booster Box - $89.99"

## 📊 Monitoring & Analytics

### Real-time Status

```javascript
const poster = new RedditPoster();
const stats = poster.getPostingStats();

// Shows for each subreddit:
// - Can post status
// - Hours since last post
// - Daily post count
// - Time until next available post
```

### Posted Products Tracking

- All posted products stored with timestamps
- Track which subreddits used for each product
- Prevent duplicate posts across subreddits
- Historical data for analytics

## 🔧 Configuration Files

### Persistent State Files

- `.subreddit_state.json` - Cooldowns, daily counts, posted products
- `.reddit_state.json` - OAuth tokens and authentication state
- `config.json` - Main application configuration

### Environment Variables

```env
# Reddit API Credentials
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password
REDDIT_USER_AGENT=StockSpot/1.0.0

# Observer Mode Settings (existing)
OBSERVER_MODE_ENABLED=true
OBSERVER_MODE_DAYS=7
```

## 🚀 Deployment

### Production Setup

1. **Configure Credentials**: Set Reddit API credentials in environment
2. **Enable Observer Mode**: Start with observer mode for new accounts
3. **Monitor Logs**: Watch for rate limits and subreddit issues
4. **Regular Maintenance**: Check stats and adjust cooldowns as needed

### Health Checks

```javascript
// Test Reddit connection
const result = await poster.testConnection();
if (result.success) {
  console.log(`Connected as: ${result.username}`);
}

// Check subreddit availability
const stats = poster.getPostingStats();
const available = Object.values(stats).filter(s => s.canPost).length;
console.log(`${available} subreddits available for posting`);
```

## 🔍 Troubleshooting

### Common Issues

**No subreddits available for category**
- Check if subreddits are disabled
- Verify cooldowns haven't locked all options
- Ensure category is properly configured

**Rate limiting errors**
- Reddit enforces strict rate limits
- System will automatically retry
- Consider increasing cooldown times

**Authentication failures**
- Check Reddit credentials in environment
- Verify OAuth app configuration
- Token will auto-refresh on expiry

**Observer mode blocking posts**
- Check observer mode status
- Manually disable if needed for testing
- Mode auto-disables after configured days

### Debug Commands

```bash
# Check system status
node reddit_config_manager.js status

# Test specific category
node reddit_config_manager.js test pokemon_tcg

# Reset cooldowns for testing
node reddit_config_manager.js reset-cooldowns

# Run comprehensive tests
node test_enhanced_reddit_posting.js
```

## 📈 Performance

### Efficiency Improvements

- **Intelligent Selection**: Avoids unnecessary API calls
- **Persistent State**: No data loss on restart
- **Batch Operations**: Efficient state management
- **Smart Caching**: OAuth token caching

### Scalability

- **Multiple Categories**: Single product can route to multiple subreddits
- **Load Distribution**: Spreads posts across available subreddits
- **Graceful Degradation**: Continues working even if some subreddits fail

## 🎨 Customization

### Adding New Subreddits

Edit `SubredditConfig.js`:

```javascript
'NewSubreddit': {
  name: 'NewSubreddit',
  allowedCategories: ['category1', 'category2'],
  minCooldownHours: 6,
  maxPostsPerDay: 3,
  affiliateAllowed: true,
  // ... other settings
}
```

### Modifying Title Templates

Each subreddit can have custom title variations:

```javascript
titleVariations: [
  '{name} - ${price}',
  'Deal Alert: {name} - ${price}',
  'Hot Deal: {name} for ${price}',
  // Add more variations
]
```

### Adjusting Safety Settings

Modify cooldowns and limits as needed:
- Increase cooldowns for stricter subreddits
- Adjust daily limits based on subreddit activity
- Add new safety checks in posting logic

---

This enhanced system provides production-grade Reddit posting with comprehensive safety features, intelligent routing, and robust error handling for StockSpot's autonomous deal bot.