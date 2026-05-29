def test_export_endpoint_exists():
    from app.api.export import router

    routes = [route.path for route in router.routes]

    assert "/export/transactions" in routes