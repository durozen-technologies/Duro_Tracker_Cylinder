import os

files = [
    r'd:\Duro_Tracker\frontend\src\screens\admin\PurchasesScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\ItemsScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\BuyersScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\InventoryScreen.tsx',
    r'd:\Duro_Tracker\frontend\src\screens\admin\SettingsScreen.tsx'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # The actual string that was inserted has literal backslashes: \'ios\' etc.
    content = content.replace(r"\'ios\'", "'ios'")
    content = content.replace(r"\'padding\'", "'padding'")
    content = content.replace(r"\'height\'", "'height'")

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print('Fixed backslashes in tsx files')
