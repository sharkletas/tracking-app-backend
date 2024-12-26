import React, { useState, useCallback, useEffect } from 'react';
import {
  AppProvider,
  Frame,
  Navigation,
  Page,
  TopBar,
  ActionList,
} from '@shopify/polaris';
import {
  OrderIcon,
  PackageIcon,
  ProductIcon,
  ChartVerticalFilledIcon,
  PaintBrushRoundIcon,
  StatusActiveIcon,
  NotificationIcon,
  SearchIcon,
  HomeIcon,
} from '@shopify/polaris-icons';
import logo from './assets/logo.png';
import '@shopify/polaris/build/esm/styles.css';


function App() {
  const [selected, setSelected] = useState('home');
  const [pendingOrders, setPendingOrders] = useState(15); // Label de órdenes pendientes (simulación)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Estado para almacenar el estado del backend
  const [backendStatus, setBackendStatus] = useState('Cargando...');

  // Llamada al backend para verificar el estado

const API_URL = 'https://tracking-app-backend-iab9.onrender.com';

useEffect(() => {
    console.log('API URL:', API_URL); // Verifica que la variable se esté cargando
    const fetchBackendStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/health`);
            const data = await response.text();
            setBackendStatus(data);
        } catch (error) {
            console.error('Error al conectar con el backend:', error);
            setBackendStatus('Error al conectar con el backend');
        }
    };

    fetchBackendStatus();
}, []);

  const toggleIsUserMenuOpen = useCallback(
    () => setIsUserMenuOpen((open) => !open),
    []
  );

  const handleSearchChange = useCallback((value) => {
    setSearchValue(value);
    setIsSearchActive(value.length > 0);
  }, []);

  const handleSearchResultsDismiss = useCallback(() => {
    setIsSearchActive(false);
    setSearchValue('');
  }, []);

  const logoMarkup = {
    topBarSource: logo,
    accessibilityLabel: 'Sharkletas',
    url: '#',
    width: 220,
    height: 30,
  };

  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={[
        {
          items: [{ content: 'Ir a Shopify', onAction: () => window.open('https://admin.shopify.com/store/2b636b-a7', '_blank') }],
        },
        {
          items: [{ content: 'Cambiar Contraseña', onAction: () => alert('Contraseña actualizada') }],
        },
        {
          items: [{ content: 'Cerrar Sesión', onAction: () => alert('Sesión cerrada') }],
        },
      ]}
      name="Admin"
      initials="A"
      open={isUserMenuOpen}
      onToggle={toggleIsUserMenuOpen}
    />
  );

  const searchFieldMarkup = (
    <TopBar.SearchField
      onChange={handleSearchChange}
      value={searchValue}
      placeholder="Buscar (número de orden o tracking)"
      showFocusBorder
    />
  );

  const searchResultsMarkup = isSearchActive ? (
    <ActionList
      items={[
        { content: 'Buscar número de orden' },
        { content: 'Buscar tracking number' },
      ]}
    />
  ) : null;

  const topBarMarkup = (
    <TopBar
      userMenu={userMenuMarkup}
      searchResultsVisible={isSearchActive}
      searchField={searchFieldMarkup}
      searchResults={searchResultsMarkup}
      onSearchResultsDismiss={handleSearchResultsDismiss}
    />
  );

  const navigationMarkup = (
    <Navigation location="/">
      <Navigation.Section
        items={[
          {
            label: 'Home',
            icon: HomeIcon,
            onClick: () => setSelected('home'),
            selected: selected === 'home',
          },
          {
            label: 'Órdenes',
            icon: OrderIcon,
            badge: pendingOrders.toString(),
            onClick: () => setSelected('orders'),
            selected: selected === 'orders',
          },
          {
            label: 'Paquetes',
            icon: PackageIcon,
            onClick: () => setSelected('packages'),
            selected: selected === 'packages',
          },
          {
            label: 'Productos',
            icon: ProductIcon,
            onClick: () => setSelected('products'),
            selected: selected === 'products',
          },
          {
            label: 'Reportes',
            icon: ChartVerticalFilledIcon,
            onClick: () => setSelected('reports'),
            selected: selected === 'reports',
          },
          {
            label: 'Página de Seguimiento',
            icon: PaintBrushRoundIcon,
            onClick: () => setSelected('trackingPage'),
            selected: selected === 'trackingPage',
          },
          {
            label: 'Status',
            icon: StatusActiveIcon,
            onClick: () => setSelected('status'),
            selected: selected === 'status',
          },
        ]}
      />
    </Navigation>
  );

  const pageContent = {
    home: <p>Estado del Backend: {backendStatus}</p>,
    orders: <p>Esta es la página de Órdenes.</p>,
    packages: <p>Esta es la página de Paquetes.</p>,
    products: <p>Esta es la página de Productos.</p>,
    reports: <p>Esta es la página de Reportes.</p>,
    trackingPage: <p>Esta es la página de Seguimiento.</p>,
    status: <p>Esta es la página de Status.</p>,
  };

  return (
    <AppProvider>
      <Frame
        topBar={topBarMarkup}
        navigation={navigationMarkup}
        logo={logoMarkup}
      >
        <Page title={selected.toUpperCase()}>{pageContent[selected]}</Page>
      </Frame>
    </AppProvider>
  );
}

export default App;
