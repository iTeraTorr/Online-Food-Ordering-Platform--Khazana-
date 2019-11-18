var express=require("express");
var path = require("path");
var async = require('async');
var session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
var app=express();
app.set('view engine', 'ejs');
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: true
}));

let db = new sqlite3.Database('rs.db', function(err){
  if (err) {
    return console.error(err.message);
  }
  console.log('Connected to the in-memory SQlite database.');
});


app.get("/", function(req,res){
  console.log("Get request received at /");
  let sql="select * from restaurant";
  db.all(sql, [], function(err, rows){
      if (err){
        console.log(err);
      }
    res.render('index', { name: rows, request:req });
  });
});


app.get("/logout", function(request,response){
  request.session.loggedin = false;
  request.session.username = "";
  response.redirect('/');
});


app.get("/restaurant/:rest_id",function(req,res){
  let params=req.params;
  console.log(params);
  let rest_id=Number(params.rest_id);
  console.log("rest is is ",rest_id);
  console.log("Recieved get request at restaurant with rest_id = "+rest_id);
  let sql1="select * from menu inner join food on menu.food_id=food.food_id where menu.rest_id="+rest_id;
  console.log("The sql statement executed is ",sql1);
  var rest_name;
  var rows_global1;
  var rows_global2;
  db.get("SELECT name FROM restaurant WHERE rest_id ="+rest_id, function(err, row){
    rest_name=row.name;
    db.all(sql1, [], function(err, rows1){
      rows_global1=rows1;
      db.all("select * from restaurant", [], function(err, rows2){
        rows_global2=rows2;
        console.log("Logging Rows 1 ", rows1);
        console.log("Logging Rows 2 ", rows2);
        console.log("Logging rest_name ", rest_name);
        res.render('menuitem', { food: rows1, name: rows2, rest_name:rest_name, request:req });
      });
    });
  });
});


function foo(arr)
{
    var a = [], b = [], prev;
    arr.sort();
    for ( var i = 0; i < arr.length; i++ ) {
        if ( arr[i] !== prev ) {
            a.push(arr[i]);
            b.push(1);
        } else {
            b[b.length-1]++;
        }
        prev = arr[i];
    }

    return [a, b];
}

app.post("/order", function(req,res){
  console.log("Logging request body",req.body);
  console.log("Logging request body ourcart",req.body.ourcart);
  var ourcart=req.body.ourcart;
  console.log("Cart is", ourcart);
  console.log("Logging request body restname",req.body.rest_name);
  var rest_name=req.body.rest_name;
  console.log("rest name is", rest_name);
  var cart=ourcart.split(",").map(Number);
  console.log("cart in array form is", cart);
  var result=foo(cart);
  var food_id=result[0];
  var freq=result[1];
  var m=new Map();
  for(let index=0;index<food_id.length;index++)
  {
    m.set(food_id[index],freq[index]);
  }
  console.log("Logging ids and freq ",food_id, freq);
  db.get("select * from restaurant where name='"+rest_name+"'", function(err, row){
    var restaurant=row;
    console.log("restaurant is ", restaurant);
    db.all("select * from food where food_id in ("+food_id+")",function(err,rows){
      var food_item=rows;
      var sum=0;
      for(let index=0;index<food_item.length;index++)
      {
        sum+=food_item[index].price*m.get(food_item[index].food_id);
      }
      db.run("insert into orders(sum) values(?)",[sum],function(err){
        db.get("SELECT * FROM orders ORDER BY order_id DESC LIMIT 1",[],function(err,row){
          var order_detail=row;
          db.run("insert into belongs(rest_id,order_id) values(?,?)",[restaurant.rest_id,order_detail.order_id],function(err){
            db.run("insert into paid_by(order_id,username) values(?,?)",[order_detail.order_id,req.session.username],function(err){
              for(let index=0;index<food_item.length;index++)
              {
                db.run("insert into order_details(order_id,food_id,quantity) values(?,?,?)",[order_detail.order_id,food_item[index].food_id,m.get(food_item[index].food_id)],function(err){});
              }
              res.render('bill', { restaurant:restaurant, food_item:food_item, total:sum, order_detail:order_detail, quantity:m });
            });
          });
        });
      });
    });
  });
});

app.get('/login', function(req, res) {
  res.render('login',{})
});

app.get('/profile', function(req, res) {
  if(req.session.loggedin){
    db.get("select * from customers where username = ?",[req.session.username], function(err,row){
      if(err){
        console.log(err);
      }
      res.render('myprofile',{person:row});
    });
  } else {
    res.redirect("/login");
  }
});

app.get('/myorders', function(req, res) {
	if(req.session.loggedin){
    db.all("select * from paid_by inner join orders on paid_by.order_id=orders.order_id inner join belongs on orders.order_id=belongs.order_id inner join restaurant on restaurant.rest_id=belongs.rest_id where username = ?",[req.session.username], function(err,rows){
      if(err){
        console.log(err);
      }
			var order_ids=rows;
			console.log("Order Ids are ",order_ids);
			var alldetails=[];
			function doA(order_id)
			{
				return new Promise(function(resolve, reject)
				{
					db.all("select * from order_details inner join food on food.food_id=order_details.food_id where order_details.order_id=?",[order_id],function(err,itemdetails)
					{
						if(err)
						{
							console.log(err);
						} else {
							resolve(itemdetails);
						}
		    	});
				});
			}
			async function executeAsyncTask ()
			{
				for(var index=0;index<order_ids.length;index++)
				{
					var temp = await doA(order_ids[index].order_id);
					alldetails.push(temp);
				}
				console.log("order_ids is ",order_ids);
				console.log("all_details is ",alldetails);
				res.render('myorders',{order_ids:order_ids, alldetails:alldetails});
			}
			executeAsyncTask();
	  });
  } else {
    res.redirect("/login");
  }
});

app.post('/auth', function(request, response) {
	var username = request.body.username;
	var password = request.body.password;
	if (username && password) {
		db.get('SELECT * FROM account WHERE username = ? AND password = ?', [username, password], function(err, rows) {
			if (typeof rows != 'undefined') {
				request.session.loggedin = true;
				request.session.username = username;
				response.redirect('/');
			}
      else {
				response.send('Incorrect Username and/or Password!');
			}
			response.end();
		});
	} else {
		response.send('Please enter Username and Password!');
		response.end();
	}
});

app.get("/register",function(req,res){
  res.render("register");
});

app.post('/register', function(request, response) {
	var username = request.body.username;
	var password = request.body.password;
  var firstname = request.body.firstname;
  var lastname = request.body.lastname;
  var phone = request.body.phone;
	db.get("select * from account where username=?",[username],function(err,rows){
		if(err){
			console.log(err);
		}
		if(typeof(rows)==undefined)
		{
			db.run("insert into account values(?,?)",[username,password],function(err){if(err) {console.log(err);}});
		  db.run("insert into customers values(?,?,?,?)",[username,firstname,lastname,phone],function(err){if(err) {console.log(err);}});
			response.redirect("/login");
		} else {
			response.send("Username already exists <a href='/register'>try again</a>");
		}
	});

});

app.get('/edit', function(req, res) {
  if(req.session.loggedin){
    db.get("select * from customers inner join account on customers.username=account.username where customers.username = ?",[req.session.username], function(err,row){
      if(err){
        console.log(err);
      }
      res.render('edit',{person:row});
    });
  } else {
    res.redirect("/login");
  }
});

app.post('/edit', function(request, response) {
	var username=request.session.username;
	var password = request.body.password;
  var firstname = request.body.firstname;
  var lastname = request.body.lastname;
  var phone = request.body.phone;
	db.run("update customers set first_name=?,last_name=?,phone=? where username=?",[firstname,lastname,phone,username],function(err){if(err) {console.log(err);}});
	db.run("update account set password=? where username=?",[password,username],function(err){if(err) {console.log(err);}});
  request.session.loggedin=false;
	request.session.username="";
	response.redirect("/login");
});

app.listen(8080, function(){
  console.log("Listening to port 8080");
});
