def _auth_headers(client):
    client.post("/auth/register", json={"full_name": "Tester", "email": "biz@test.com", "password": "pass1234"})
    r = client.post("/auth/login", json={"email": "biz@test.com", "password": "pass1234"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_my_businesses_returns_all_owned_businesses(client):
    headers = _auth_headers(client)

    client.post("/businesses", json={"name": "Biz One"}, headers=headers)
    client.post("/businesses", json={"name": "Biz Two"}, headers=headers)

    response = client.get("/businesses/my", headers=headers)

    assert response.status_code == 200
    names = {b["name"] for b in response.json()}
    assert names == {"Biz One", "Biz Two"}


def test_update_business_changes_persist(client):
    headers = _auth_headers(client)

    created = client.post("/businesses", json={"name": "Old Name"}, headers=headers)
    business_id = created.json()["business_id"]

    response = client.patch(
        f"/businesses/{business_id}",
        json={"name": "New Name", "category": "Retail"},
        headers=headers,
    )

    assert response.status_code == 200

    businesses = client.get("/businesses/my", headers=headers).json()
    updated = next(b for b in businesses if b["id"] == business_id)
    assert updated["name"] == "New Name"
    assert updated["category"] == "Retail"


def test_cannot_update_another_users_business(client):
    headers_a = _auth_headers(client)
    created = client.post("/businesses", json={"name": "A's Business"}, headers=headers_a)
    business_id = created.json()["business_id"]

    client.post("/auth/register", json={"full_name": "Other", "email": "other@test.com", "password": "pass1234"})
    login_b = client.post("/auth/login", json={"email": "other@test.com", "password": "pass1234"})
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    response = client.patch(
        f"/businesses/{business_id}",
        json={"name": "Hijacked"},
        headers=headers_b,
    )

    assert response.status_code == 404


def test_delete_import_batch_removes_only_that_batch(client):
    headers = _auth_headers(client)
    business_id = client.post("/businesses", json={"name": "Import Test Biz"}, headers=headers).json()["business_id"]

    csv_1 = "transaction_reference,amount,status,payment_date,customer_identifier,provider\nTXN-A,1000,success,2026-01-01,cust1,Paystack\n"
    csv_2 = "transaction_reference,amount,status,payment_date,customer_identifier,provider\nTXN-B,2000,success,2026-01-02,cust2,Paystack\n"

    r1 = client.post(
        "/csv/transactions",
        data={"business_id": str(business_id), "provider": "Paystack"},
        files={"file": ("first.csv", csv_1, "text/csv")},
        headers=headers,
    )
    batch_1 = r1.json()["import_batch_id"]

    r2 = client.post(
        "/csv/transactions",
        data={"business_id": str(business_id), "provider": "Paystack"},
        files={"file": ("second.csv", csv_2, "text/csv")},
        headers=headers,
    )
    assert r2.json()["imported"] == 1

    delete_response = client.delete(
        f"/csv/imports/{batch_1}?business_id={business_id}",
        headers=headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted_count"] == 1

    export = client.get(f"/export/transactions?business_id={business_id}", headers=headers)
    assert "TXN-A" not in export.text
    assert "TXN-B" in export.text


def test_delete_unknown_import_batch_returns_404(client):
    headers = _auth_headers(client)
    business_id = client.post("/businesses", json={"name": "Empty Biz"}, headers=headers).json()["business_id"]

    response = client.delete(
        f"/csv/imports/does-not-exist?business_id={business_id}",
        headers=headers,
    )

    assert response.status_code == 404
