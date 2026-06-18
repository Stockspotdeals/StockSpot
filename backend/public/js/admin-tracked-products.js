const messageEl = document.getElementById('message');
const productForm = document.getElementById('product-form');
const productList = document.getElementById('product-list');

const showMessage = (text, type = 'success') => {
  messageEl.innerHTML = `<div class="message ${type}">${text}</div>`;
  setTimeout(() => { messageEl.innerHTML = ''; }, 5000);
};

const fetchProducts = async () => {
  try {
    const response = await fetch('/api/tracked-products', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to fetch products');
    const data = await response.json();
    renderProducts(data.products || []);
  } catch (error) {
    showMessage(error.message, 'error');
  }
};

const renderProducts = (products) => {
  productList.innerHTML = products.map(product => `
    <tr>
      <td>${product.title || ''}</td>
      <td>${product.retailer || ''}</td>
      <td>${product.category || ''}</td>
      <td><a href="${product.url}" target="_blank">Link</a></td>
      <td><button data-id="${product._id}" class="delete-btn">Delete</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', async (event) => {
      const id = event.target.dataset.id;
      if (!confirm('Delete this tracked product?')) return;
      await deleteProduct(id);
    });
  });
};

const deleteProduct = async (id) => {
  try {
    const response = await fetch(`/api/tracked-products/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Delete failed');
    }
    showMessage('Product deleted successfully');
    fetchProducts();
  } catch (error) {
    showMessage(error.message, 'error');
  }
};

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const body = {
    title: formData.get('title'),
    retailer: formData.get('retailer'),
    category: formData.get('category'),
    url: formData.get('url')
  };
  try {
    const response = await fetch('/api/tracked-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add tracked product');
    }
    productForm.reset();
    showMessage('Tracked product added successfully');
    fetchProducts();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

fetchProducts();
