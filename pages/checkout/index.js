import React, { Component } from "react";
import PropTypes from 'prop-types';
import { connect } from "react-redux";
import Head from "next/head";
import Link from "next/link";
import { withRouter } from 'next/router'
import ccFormat from '../../utils/ccFormat';

// commerce.js client
import commerce from '../../lib/commerce';

// components
import Root from "../../components/common/Root";
import ShippingForm from "../../components/checkout/common/ShippingForm";
import PaymentDetails from "../../components/checkout/common/PaymentDetails";
import BillingDetails from "../../components/checkout/common/BillingDetails";
import AuthModal from "../../components/common/AuthModal";

// Checkout redux action creators
import {
  generateCheckoutTokenFromCart as dispatchGenerateCheckout,
  getShippingOptionsForCheckout as dispatchGetShippingOptions,
  setShippingOptionInCheckout as dispatchSetShippingOptionsInCheckout,
  captureOrder as dispatchCaptureOrder,
} from '../../store/actions/checkoutActions';

class CheckoutPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isAuthorized: false,
      openLoginModal: false,

      deliveryCountry: 'CA',
      deliveryRegion: 'BC',

      // string property names to conveniently identify inputs related to commerce.js validation errors
      // e.g error { param: "shipping[name]"}
      firstName: 'John',
      lastName: 'Doe',
      'customer[email]': 'john@doe.com',
      'shipping[name]': 'John Doe',
      'shipping[street]': '318 Homer Street',
      street2: '',
      'shipping[town_city]': 'Vancouver',
      'shipping[postal_zip_code]': 'V6B 2V2',
      orderNotes: '',
      countries: {},
      subdivisions: {},

      'fulfillment[shipping_method]': '',
      cardNumber: ccFormat('4242424242424242'),
      expMonth: '11',
      expYear: '22',
      cvc: '123',
      billingPostalZipcode: 'V6B 2V2',

      errors: {
        'fulfillment[shipping_method]': null,
        gateway_error: null,
        'customer[email]': null,
        'shipping[name]': null,
        'shipping[street]': null,
        'shipping[town_city]': null,
        'shipping[postal_zip_code]': null
      },

      selectedGateway: 'test_gateway',
    }
  }

  componentDidMount() {
    // on initial mount generate checkout token object from the cart,
    // and then subsequently below in componentDidUpdate if the props.cart.total_items has changed
    this.generateToken();
    this.getAllCountries();
    this.getRegions(this.state.deliveryCountry)
  }

  componentDidUpdate(prevProps, prevState) {
    // if cart is empty then redirect out of checkout;
    if (this.props.cart && this.props.cart.total_items === 0) {
      this.redirectOutOfCheckout()
    };

    // if cart items have changed then regenerate checkout token object to reflect changes.
    if (prevProps.cart && prevProps.cart.total_items !== this.props.cart.total_items) {
      // reset selected shipping option
      this.setState({
        'fulfillment[shipping_method]': '',
      })
      // regenerate checkout token object since cart has been updated
      this.generateToken();
    }

    const hasDeliveryCountryChanged = prevState.deliveryCountry !== this.state.deliveryCountry;
    const hasDeliveryRegionChanged = prevState.deliveryRegion !== this.state.deliveryRegion;

    // refresh list of regions when delivery country has changed
    if (hasDeliveryCountryChanged) {
      this.getRegions(this.state.deliveryCountry);
    }

    // if delivery country or region have changed, and we still have a checkout token object, then refresh the token,
    // and reset the previously selected shipping method
    if (hasDeliveryCountryChanged || hasDeliveryRegionChanged && this.props.checkout) {
      // reset selected shipping option since previous checkout token live object shipping info
      // was set based off delivery country, deliveryRegion
      this.setState({
        'fulfillment[shipping_method]': '',
      })
      this.generateToken();
    }

    // if selected shippiing option changes, regenerate checkout token object to reflect changes
    if (prevState['fulfillment[shipping_method]'] !== this.state['fulfillment[shipping_method]'] && this.state['fulfillment[shipping_method]'] && this.props.checkout) {
      // update checkout token object with shipping information
      this.props.dispatchSetShippingOptionsInCheckout(this.props.checkout.id, this.state['fulfillment[shipping_method]'], this.state.deliveryCountry, this.state.deliveryRegion);
    }
  }

  generateToken = () => {
    const { cart, dispatchGenerateCheckout, dispatchGetShippingOptions } = this.props;
    const { deliveryCountry: country, deliveryRegion: region } = this.state;
    return dispatchGenerateCheckout(cart.id)
      .then((checkout) => {
        // continue and dispatch getShippingOptionsForCheckout to get shipping options based on checkout.id
        return dispatchGetShippingOptions(checkout.id, country, region)
      })
      .catch(error => {
        console.log('error caught in checkout/index.js in generateToken', error);
      })
  }

  redirectOutOfCheckout = () => {
    console.log('redirecting out of checkout');
    this.props.router.push('/');
  }

  handleGatewayChange = (selectedGateway) => {
    this.setState({
      selectedGateway
    })
  }

  handleFormChanges = (e) => {
    // when input cardNumber changes format using ccFormat helper
    if (e.target.name === "cardNumber") {
      e.target.value = ccFormat(e.target.value)
    }
    // update form's input by name in state
    this.setState({
      [e.target.name]: e.target.value
    })
  }

  captureOrder = (e) => {
    e.preventDefault();

    // reset error states
    this.setState({
      errors: {
        "fulfillment[shipping_method]": null,
        gateway_error: null,
        "shipping[name]": null,
        "shipping[street]": null,
      },
    });

    // set up line_items object and inner variant object for order object below
    const line_items = this.props.checkout.live.line_items.reduce((obj, lineItem) => {
      const variants = lineItem.variants.reduce((obj, variant) => {
        obj[variant.variant_id] = variant.option_id;
        return obj;
      }, {});
      obj[lineItem.id] = { ...lineItem, variants };
      return obj;
    }, {});

    // construct order object
    const newOrder = {
      line_items,
      customer: {
        firstname: this.state.firstName,
        lastname: this.state.lastName,
        email: this.state["customer[email]"]
      },
      // collected 'order notes' data for extra field configured in the Chec Dashboard
      extrafields: {
        extr_j0YnEoqOPle7P6: this.state.orderNotes,
      },
      shipping: {
        name: this.state["shipping[name]"],
        country: this.state.deliveryCountry,
        street: this.state["shipping[street]"] + this.state.street2,
        town_city: this.state["shipping[town_city]"],
        county_state: this.state.deliveryRegion,
        postal_zip_code: this.state["shipping[postal_zip_code]"]
      },
      fulfillment: {
        shipping_method: this.state["fulfillment[shipping_method]"]
      },
      payment: {
        gateway: this.state.selectedGateway,
      },
    }

    // if test gateway selected add necessary card data
    // for the order to be completed.
    if (this.state.selectedGateway === 'test_gateway') {
      newOrder.payment.card = {
        number: this.state.cardNumber,
        expiry_month: this.state.expMonth,
        expiry_year: this.state.expYear,
        cvc: this.state.cvc,
        postal_zip_code: this.state.billingPostalZipcode,
      }
    }

    // capture order
    // set order-receipt global state
    // and redirect to confirmation page
    // or handle errors
    this.props.dispatchCaptureOrder(this.props.checkout.id, newOrder)
      .then(() => {
        this.props.router.push('/checkout/confirm');
      })
      .catch(({ data: { error = {} }}) => {
        let errorToAlert = '';
        if (error.type === 'validation') {
          console.log('error while capturing order', error.message)

          error.message.forEach(({param, error}, i) => {
            this.setState({
              errors: {
                ...this.state.errors,
                [param]: error
              }
            })
          })

          const allErrors = error.message.reduce((string, error) => {
            return `${string} ${error.error}`
          }, '')
          errorToAlert = allErrors;
        }

        if (error.type === 'gateway_error' || error.type === 'not_valid' || error.type === 'bad_request') {
          this.setState({
            errors: {
              ...this.state.errors,
              [(error.type === 'not_valid' ? 'fulfillment[shipping_method]' : error.type)]: error.message
            }
          })
          errorToAlert = error.message
        }
        if (errorToAlert) {
          alert(errorToAlert);
        }
      })
  }

  // commmerce.js helpers
  getAllCountries = () => {
    commerce.services.localeListCountries().then(resp => {
      this.setState({
        countries: resp.countries
      })
    }).catch(error => console.log(error))
  }

  getRegions = (deliveryCountry) => {
    commerce.services.localeListSubdivisions(deliveryCountry).then(resp => {
      this.setState({
        subdivisions: resp.subdivisions
      })
    }).catch(error => console.log(error))
  }

  render() {
    const { checkout, shippingOptions } = this.props;
    const { line_items = [] } = checkout;
    const selectedShippingOption = shippingOptions.find(({id}) => id === this.state['fulfillment[shipping_method]']);
    return (
      <Root>
        <Head>
          <title>Checkout</title>
        </Head>

        <div className="custom-container py-5 my-4 my-sm-5">
          {/* Breadcrums Mobile */}
          <div
            className="d-flex d-sm-none px-4 py-3 borderbottom border-color-gray400 justify-content-center"
            style={{ margin: "0 -1.5rem" }}
          >
            <Link href="/collection">
              <div className="font-size-caption text-decoration-underline cursor-pointer">
                Cart
              </div>
            </Link>
            <img src="/icon/arrow-right.svg" className="w-16 mx-1" />
            <div className="font-size-caption cursor-pointer">
              Checkout
            </div>
          </div>

          {/* Row */}
          <div className="row mt-4">
            <div className="col-12 col-md-10 col-lg-6 offset-md-1 offset-lg-0">
              {/* Breadcrums Desktop */}
              <div className="d-none d-sm-flex pb-4">
                <Link href="/collection">
                  <div className="font-size-caption text-decoration-underline cursor-pointer">
                    Cart
                  </div>
                </Link>
                <img src="/icon/arrow-right.svg" className="w-16 mx-1" />
                <div className="font-size-caption font-weight-bold cursor-pointer">
                  Checkout
                </div>
              </div>
              {
                checkout
                ? (
                <form onChange={this.handleFormChanges}>
                  {/* Login Modal Modal */}
                  <AuthModal
                    isAuthorized={this.state.isAuthorized}
                  />

                  {/* ShippingDetails */}
                  <p className="font-size-subheader font-weight-semibold mb-4">
                    Customer and Shipping Details
                  </p>
                  <div className="mb-5">
                    <ShippingForm
                      firstName={this.state.firstName}
                      lastName={this.state.lastName}
                      customerEmail={this.state['customer[email]']}
                      shippingOptions={shippingOptions}
                      countries={this.state.countries}
                      subdivisions={this.state.subdivisions}
                      deliveryCountry={this.state.deliveryCountry}
                      deliveryRegion={this.state.deliveryRegion}
                      selectedShippingOptionId={this.state['fulfillment[shipping_method]']}
                      selectedShippingOption={selectedShippingOption}
                      shippingStreet={this.state['shipping[street]']}
                      shippingStreet2={this.state.street2}
                      shippingTownCity={this.state['shipping[town_city]']}
                      shippingPostalZipCode={this.state['shipping[postal_zip_code]']}
                      orderNotes={this.state.orderNotes}
                    />
                  </div>

                  {/* Payment Methods */}
                  <PaymentDetails
                    gateways={checkout.gateways}
                    handleGatewayChange={this.handleGatewayChange}
                    selectedGateway={this.state.selectedGateway}

                    cardNumber={this.state.cardNumber}
                    expMonth={this.state.expMonth}
                    expYear={this.state.expYear}
                    cvc={this.state.cvc}
                    billingPostalZipcode={this.state.billingPostalZipcode}
                  />

                  {/* Billing Address */}
                  {
                    checkout.collectsBillingAddress ?
                    <BillingDetails />
                    : ''
                  }

                    <button
                      type="submit"
                      className="bg-black font-color-white w-100 border-none h-56 font-weight-semibold"
                      onClick={this.captureOrder}
                    >
                      Make Payment
                    </button>
                </form>
                )
                : ''
              }
            </div>

            <div className="col-12 col-md-5 offset-md-1 d-none d-lg-block">
              <div className="bg-brand200 p-5 order-summary">
                <div className="borderbottom font-size-subheader border-color-gray400 pb-2 font-weight-medium">
                  Your order
                </div>
                <div className="pt-3 borderbottom border-color-gray400">
                  {(checkout.live ? checkout.live.line_items : []).map((item, index, items) => {
                    const _item = line_items.find(i => i.id === item.id); // from root checkout token object, not checkout.live, since it includes an image property
                    return (
                      <div
                        key={item.id}
                        className="d-flex mb-2"
                      >
                        { (_item && _item.image)
                          ? (<img className="checkout__line-item-image mr-2" src={_item.image} />)
                          : ''
                        }
                        <div className="d-flex flex-grow-1">
                          <div className="flex-grow-1">
                            <p className="font-weight-medium">
                              {item.product_name}
                            </p>
                            <p className="font-color-light">Quantity: {item.quantity}</p>
                          </div>
                          <div className="text-right font-weight-semibold">
                            ${item.price.formatted_with_code}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <form className="d-flex py-3 borderbottom border-color-gray400">
                  <input
                    placeholder="Gift card or discount code"
                    className="mr-2 flex-grow-1"
                  />
                  <button
                    className="font-color-white border-none font-weight-medium px-4"
                    disabled
                  >
                    Apply
                  </button>
                </form>
                <div className="py-3 borderbottom border-color-black">
                  {[
                    {
                      name: "Subtotal",
                      amount: checkout.live ? checkout.live.subtotal.formatted_with_symbol : '',
                    },
                    {
                      name: "Tax",
                      amount: checkout.live ? checkout.live.tax.amount.formatted_with_symbol : '',
                    },
                    {
                      name: "Shipping",
                      amount: selectedShippingOption ? `${selectedShippingOption.description} - ${selectedShippingOption.price.formatted_with_symbol}` : 'No shipping method selected',
                    }
                  ].map((item, i) => (
                    <div key={i} className="d-flex justify-content-between align-items-center mb-2">
                      <p>{item.name}</p>
                      <p className="text-right font-weight-medium">
                        {item.amount}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="d-flex justify-content-between align-items-center mb-2 pt-3">
                  <p className="font-size-title font-weight-semibold">
                    Total amount
                  </p>
                  <p className="text-right font-weight-semibold font-size-title">
                    $ { checkout.live ? checkout.live.total.formatted_with_code : '' }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Root>
    );
  }
}

CheckoutPage.propTypes = {
  checkout: PropTypes.object,
  cart: PropTypes.object,
  shippingOptions: PropTypes.array,
  dispatchGenerateCheckout: PropTypes.func,
  dispatchGetShippingOptions: PropTypes.func,
}

export default withRouter(connect(({ checkout: { checkoutTokenObject, shippingOptions }, cart }) => ({ checkout: checkoutTokenObject, shippingOptions, cart }), {
  dispatchGenerateCheckout,
  dispatchGetShippingOptions,
  dispatchSetShippingOptionsInCheckout,
  dispatchCaptureOrder,
})(CheckoutPage));