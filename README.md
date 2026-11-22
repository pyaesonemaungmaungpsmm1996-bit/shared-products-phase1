# Shared Products · အဆင့် ၁

Windows Chrome/Edge၊ Android Chrome နဲ့ iPhone Safari အတွက် responsive browser preview ဖြစ်ပါတယ်။ GitHub repo ထဲ ထည့်နိုင်တဲ့ source နဲ့ Supabase SQL migration ပါပါတယ်။

## Supabase project ပြင်ဆင်ခြင်း

1. [Supabase Dashboard](https://supabase.com/dashboard) ဖွင့်ပြီး **New project** နှိပ်ပါ။ Organization၊ project အမည်၊ database password နဲ့ region ရွေးပြီး **Create new project** နှိပ်ပါ။ Database password ကို dashboard အကွက်မှာ ဖြည့်ပါ။
2. Project ရဲ့ **SQL Editor → New query** ကိုဖွင့်ပါ။ `supabase/migrations/20261122000100_phase_one.sql` အပြည့်အစုံကို ကူးထည့်ပြီး **Run** နှိပ်ပါ။ SQL ကို project အသစ်မှာ တစ်ကြိမ် ထည့်ပါ။
3. **Authentication → Users → Add user → Create new user** မှာ စမ်းသပ်မယ့် email နဲ့ password ဖြည့်ပါ။ **Auto Confirm User** ကိုဖွင့်ပြီး **Create user** နှိပ်ပါ။ စက်သုံးလုံးမှာ ဒီ account ကို သုံးပါ။ ဤ preview မှာ account ကို dashboard ကနေ ဖန်တီးပါတယ်။
4. Project ထိပ်က **Connect** panel မှ **Project URL** နဲ့ **Publishable Key** ကို ယူပါ။ Publishable key က `sb_publishable_` နဲ့ စပါတယ်။ Preview ရဲ့ Supabase ချိတ်ဆက်ရန် form မှာ ဒီတန်ဖိုးနှစ်ခုကို ဖြည့်ပါ။
5. RLS စမ်းရန် **SQL Editor → New query** မှာ `supabase/tests/phase_one.sql` ကို ကူးထည့်ပြီး **Run** နှိပ်ပါ။ Test rows ကို rollback လုပ်ပါတယ်။ `Phase 1 SQL checks passed` ပေါ်မှ အောင်မြင်ပါတယ်။

Email/password နည်းလမ်းကို ရွေးထားတာကြောင့် test login မှာ SMTP/OTP မသုံးပါ။ Browser က Supabase JS SDK ကို jsDelivr ကနေ တင်ပါတယ်။ စက်တိုင်းမှာ အင်တာနက် လိုပါတယ်။

## Preview ကို စက်သုံးလုံးကနေ ဖွင့်ခြင်း

1. ZIP ကို ဖြည်ပါ။ GitHub မှာ **+ → New repository → Create repository** နှိပ်ပါ။ **Add file → Upload files** သို့ source ဖိုင်နဲ့ `supabase` folder ကို ဆွဲထည့်ပါ။ **Commit changes** နှိပ်ပြီး commit SHA ကို မှတ်ပါ။
2. GitHub Pages ကို အသုံးပြုမယ်ဆိုရင် **Settings → Pages → Source → Deploy from a branch → main → /(root) → Save** နှိပ်ပါ။ Pages အတွက် repository visibility က GitHub plan ပေါ် မူတည်ပါတယ်။ [GitHub Pages သတ်မှတ်ပုံ](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. **Settings → Pages → Visit site** မှ HTTPS လင့်ခ်ကို Windows Chrome/Edge၊ Android Chrome နဲ့ iPhone Safari မှာ ဖွင့်ပါ။ တခြား static HTTPS hosting ရှိရင် `index.html`၊ `app.js`၊ `style.css` သုံးဖိုင်ကို publish လုပ်လို့ရပါတယ်။
4. စက်တိုင်းမှာ အပေါ်က project URL နဲ့ publishable key တူတူထည့်ပြီး email/password တူတူနဲ့ ဝင်ပါ။

## စမ်းသပ်ရမည့် အဆင့်များ

| လုပ်ဆောင်မည့်စက် | လုပ်ဆောင်ချက် | တခြားစက်မှာ မြင်ရမည့်ရလဒ် |
| --- | --- | --- |
| Windows | **ဆိုင်အသစ်ဖွင့်ရန်** ဖြင့် ဆိုင်နဲ့ ပထမဆိုင်ခွဲ သိမ်းပါ | Android နဲ့ iPhone မှာ စာမျက်နှာကို reload မလုပ်ဘဲ ဆိုင်ပေါ်လာရမယ်။ ဆိုင်ရွေးတဲ့အခါ ပထမဆိုင်ခွဲကို မြင်ရမယ် |
| Android | အဲဒီဆိုင်ကိုရွေးပြီး `Tea` / `TEA-01` / `2500` ထည့်ပါ | Windows နဲ့ iPhone မှာ ပစ္စည်းအသစ်နဲ့ 2,500 MMK ပေါ်ရမယ် |
| iPhone | **ဈေးပြင်ရန်** နှိပ်ပြီး `3000` သိမ်းပါ | Windows နဲ့ Android မှာ 3,000 MMK ပြောင်းရမယ် |
| Android | ဈေးပြင် form ဖွင့်ထားပြီး Windows က ဈေးအရင် ပြင်ပါ။ Android မှာ အဟောင်းအပေါ်မူတည်ပြီး သိမ်းပါ | Android မှာ လက်ရှိဈေးကိုကြည့်ပြီး ပြန်ပြင်ဖို့ ပြရမယ် |
| သီးခြား browser profile | တခြား test account နဲ့ဝင်ပါ | ပထမ account ရဲ့ ဆိုင်၊ ဆိုင်ခွဲနဲ့ ပစ္စည်း မပေါ်ရပါ |

Realtime စစ်တဲ့အခါ စက်တိုင်းမှာ **Realtime ချိတ်ဆက်ထားသည်** ပေါ်ပြီးမှ စမ်းပါ။ တစ်ကြိမ်စီမှာ စက်၊ browser၊ commit SHA၊ ရလဒ်နဲ့ update ကြာချိန် မှတ်ပါ။ Connection ပြန်ရတဲ့အခါနဲ့ စာမျက်နှာပြန်ဖွင့်တဲ့အခါ အလိုအလျောက် စာရင်းပြန်ဖတ်ပါတယ်။ စာမျက်နှာပေါ်မှာ ရှိနေစဉ် ၁၅ စက္ကန့်ခြား အရန် ပြန်စစ်မှု ပါပါတယ်။

Shared Products ကို ဆိုင်အဆင့်မှာ သိမ်းပါတယ်။ Owner/Manager က ဆိုင်ခွဲထည့်၊ ပစ္စည်းထည့်၊ ဈေးပြင်နိုင်ပါတယ်။ Cashier/Stock staff/Accountant က ဒီအဆင့်မှာ ကြည့်နိုင်ပါတယ်။ Storage bucket နဲ့ permissions ကို migration မှာ ထည့်ထားပြီး ဓာတ်ပုံတင် UI နဲ့ staff စီမံ UI က နောက်ဆက်တွဲအလုပ် ဖြစ်ပါတယ်။
