import pandas as pd

rfi_data = {
    "rfi_id": [1, 2, 3, 4, 5],
    "description": [
        "Hydronic Pump",
        "HVAC System",
        "Roofing",
        "Electrical",
        "Plumbing",
    ],
    "status": ["Open", "Open", "Open", "Closed", "Open"],
    "priority": ["High", "Medium", "Low", "High", "Medium"],
    "date_created": [
        "2022-01-01",
        "2022-01-02",
        "2022-01-03",
        "2022-01-04",
        "2022-01-05",
    ],
    "date_closed": [
        "2022-01-05",
        "2022-01-06",
        "2022-01-07",
        "2022-01-08",
        "2022-01-09",
    ],
}

rfi_df = pd.DataFrame(rfi_data)
rfi_df.to_excel("rfi.xlsx", index=False, engine="openpyxl")

print("RFI data saved successfully!")
