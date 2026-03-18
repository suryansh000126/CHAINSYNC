function validateForm() {

    var email = document.getElementById("email").value;
    var phone = document.getElementById("phone").value;

    var emailError = document.getElementById("emailError");
    var phoneError = document.getElementById("phoneError");

    emailError.innerHTML = "";
    phoneError.innerHTML = "";

    var valid = true;

    // BASIC EMAIL CHECK (must contain @ and .)
    if (email === "" || email.indexOf("@") === -1 || email.indexOf(".") === -1) {
        emailError.innerHTML = "Please enter a valid email";
        valid = false;
    }

    // BASIC PHONE CHECK (10 digits only)
    if (phone === "" || phone.length !== 10) {
        phoneError.innerHTML = "Phone must be 10 digits";
        valid = false;
    } else {
        // Checking digits
        for (var i = 0; i < phone.length; i++) {
            if (phone[i] < "0" || phone[i] > "9") {
                phoneError.innerHTML = "Phone must contain digits only";
                valid = false;
                break;
            }
        }
    }

    return valid;
}
